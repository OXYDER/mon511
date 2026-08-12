import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { SUPPORT_KNOWLEDGE_BASE } from './support-knowledge-base';
import { EmailService } from '../../email/email.service';

// Gemini 3.5 Flash-Lite — génération stable la plus récente (disponibilité
// générale annoncée début août 2026), explicitement positionnée par Google
// pour l'automatisation à haut volume et faible coût. gemini-2.5-flash-lite
// (utilisé avant) n'est déjà plus accessible aux nouveaux projets malgré
// sa date de retrait officielle encore lointaine — signe que Google pousse
// activement vers cette nouvelle génération. Aucune date de retrait
// annoncée pour celle-ci au moment d'écrire ceci.
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Modèle de secours si le principal devient indisponible — même famille
// « lite », légèrement plus ancien, réduit le risque que les deux tombent
// en panne en même temps pour la même raison.
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';
const ESCALATE_MARKER = '[ESCALATE]';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly email: EmailService,
  ) {}

  /**
   * Trouve ou crée la conversation active pour cet usager (connecté) ou
   * cette session (anonyme) — une seule conversation active à la fois par
   * personne, pour garder le fil plutôt que d'en recréer une à chaque
   * message.
   */
  private async getOrCreateConversation(userId: string | null, sessionId: string | null) {
    const existing = userId
      ? await this.db.selectFrom('support_conversations').selectAll().where('user_id', '=', userId).where('status', '=', 'active').executeTakeFirst()
      : await this.db.selectFrom('support_conversations').selectAll().where('session_id', '=', sessionId).where('status', '=', 'active').executeTakeFirst();

    if (existing) return existing;

    return this.db
      .insertInto('support_conversations')
      .values({ user_id: userId, session_id: sessionId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** « Réinitialiser le chat » — ferme la conversation active (l'historique
   * reste en base pour référence, mais n'est plus affiché) ; le prochain
   * message en ouvre naturellement une nouvelle, toute neuve. */
  async resetConversation(userId: string | null, sessionId: string | null) {
    let query = this.db.updateTable('support_conversations').set({ status: 'closed', updated_at: new Date() as any });
    query = userId ? query.where('user_id', '=', userId) : query.where('session_id', '=', sessionId);
    await query.where('status', '=', 'active').execute();
  }

  async getHistory(userId: string | null, sessionId: string | null) {
    const conversation = userId
      ? await this.db.selectFrom('support_conversations').selectAll().where('user_id', '=', userId).where('status', '=', 'active').executeTakeFirst()
      : await this.db.selectFrom('support_conversations').selectAll().where('session_id', '=', sessionId).where('status', '=', 'active').executeTakeFirst();

    if (!conversation) return { conversationId: null, messages: [] };

    const messages = await this.db
      .selectFrom('support_messages')
      .selectAll()
      .where('conversation_id', '=', conversation.id)
      .orderBy('created_at', 'asc')
      .execute();

    return { conversationId: conversation.id, messages };
  }

  async sendMessage(userId: string | null, sessionId: string | null, userEmail: string | null, text: string) {
    const conversation = await this.getOrCreateConversation(userId, sessionId);

    await this.db.insertInto('support_messages').values({ conversation_id: conversation.id, role: 'user', content: text }).execute();

    const history = await this.db
      .selectFrom('support_messages')
      .selectAll()
      .where('conversation_id', '=', conversation.id)
      .orderBy('created_at', 'asc')
      .limit(20) // évite un contexte qui grossit indéfiniment sur une longue conversation
      .execute();

    const { reply, escalate } = await this.callGemini(history.map((m) => ({ role: m.role, content: m.content })));

    await this.db.insertInto('support_messages').values({ conversation_id: conversation.id, role: 'assistant', content: reply }).execute();
    await this.db.updateTable('support_conversations').set({ updated_at: new Date() as any }).where('id', '=', conversation.id).execute();

    // Ne crée plus le ticket automatiquement — seulement une suggestion
    // (escalate) affichée à l'usager, qui décide lui-même via une
    // confirmation explicite (voir confirmCreateTicket ci-dessous). Évite
    // de surcharger l'équipe de tickets que la personne ne voulait pas
    // vraiment ouvrir.
    return { conversationId: conversation.id, reply, escalate };
  }

  /** Appelée seulement après que l'usager a explicitement confirmé vouloir
   * un ticket (bouton dans le chat) — jamais automatique. */
  async prepareTicketFromChat(userId: string | null, sessionId: string | null) {
    const conversation = userId
      ? await this.db.selectFrom('support_conversations').selectAll().where('user_id', '=', userId).where('status', '=', 'active').executeTakeFirst()
      : await this.db.selectFrom('support_conversations').selectAll().where('session_id', '=', sessionId).where('status', '=', 'active').executeTakeFirst();

    if (!conversation) throw new NotFoundException('Aucune conversation active à partir de laquelle créer un ticket.');

    const history = await this.db
      .selectFrom('support_messages')
      .selectAll()
      .where('conversation_id', '=', conversation.id)
      .orderBy('created_at', 'asc')
      .execute();

    return this.prepareTicketFromConversation(history);
  }

  /** Appelle l'API Gemini avec la base de connaissances en instruction
   * système + l'historique récent de la conversation. Repli clair si la
   * clé n'est pas configurée ou que l'appel échoue (limite atteinte, etc.)
   * — jamais d'erreur opaque montrée à l'usager, toujours une proposition
   * de créer un ticket à la place. */
  private async callGemini(history: { role: string; content: string }[]): Promise<{ reply: string; escalate: boolean }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY non configurée — chat de support indisponible, repli sur ticket.');
      return { reply: "Le chat automatique n'est pas disponible pour l'instant. Je te propose de créer un ticket — notre équipe va te répondre directement.", escalate: true };
    }

    // Google retire ses modèles Gemini assez fréquemment (parfois avant
    // même la date de retrait officiellement annoncée pour les NOUVEAUX
    // projets, comme observé directement avec gemini-2.5-flash-lite) — un
    // modèle de secours évite qu'un simple changement de disponibilité chez
    // Google casse le chat le temps qu'on s'en aperçoive et corrige le code.
    for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SUPPORT_KNOWLEDGE_BASE }] },
              contents: history.map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
              generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
            }),
          },
        );

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          this.logger.error(`Gemini (${model}) a répondu ${res.status} : ${body.slice(0, 300)}`);
          continue; // essaie le modèle suivant, s'il en reste un
        }

        const data = await res.json();
        const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const escalate = rawText.includes(ESCALATE_MARKER);
        const reply = rawText.replace(ESCALATE_MARKER, '').trim() || "Je ne suis pas certain de pouvoir répondre à ça — je te propose de créer un ticket pour que notre équipe s'en occupe directement.";

        return { reply, escalate };
      } catch (error) {
        this.logger.error(`Échec de l'appel à Gemini (${model})`, error as Error);
      }
    }

    // Les deux modèles ont échoué.
    return { reply: "Notre assistant est temporairement indisponible. Je te propose de créer un ticket — notre équipe va te répondre directement.", escalate: true };
  }

  /** Appelé après confirmation explicite dans le chat ("Oui, créer un
   * ticket") — ne crée PLUS rien directement. Prépare seulement un sujet
   * et une description suggérés (résumé de l'échange), que le frontend
   * utilise pour pré-remplir le formulaire complet dans la section
   * « Billets de support », où l'usager peut revoir, corriger, et joindre
   * des fichiers avant l'envoi réel. */
  prepareTicketFromConversation(history: { role: string; content: string }[]) {
    const firstUserMessage = history.find((m) => m.role === 'user')?.content ?? '';
    const transcript = history.map((m) => `${m.role === 'user' ? 'Usager' : 'Assistant'} : ${m.content}`).join('\n\n');
    return {
      subject: firstUserMessage.slice(0, 120) || 'Question de support',
      description: `Résumé de la conversation avec l'assistant :\n\n${transcript}`,
    };
  }

  /** Création manuelle d'un ticket (formulaire complet dans « Billets de
   * support », que ce soit une demande directe ou pré-remplie depuis le
   * chat) — avec pièces jointes optionnelles, déjà téléversées au préalable
   * via le mécanisme de stockage existant. */
  async createManualTicket(
    userId: string | null,
    email: string,
    name: string | undefined,
    subject: string,
    description: string,
    attachments?: { url: string; filename: string }[],
  ) {
    const ticket = await this.db
      .insertInto('support_tickets')
      .values({ user_id: userId, email, name: name ?? null, subject, description, created_by: 'user' })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (attachments?.length) {
      await this.db
        .insertInto('support_ticket_attachments')
        .values(attachments.map((a) => ({ ticket_id: ticket.id, url: a.url, filename: a.filename })))
        .execute();
    }

    this.email
      .send(
        email,
        `Ton ticket a été créé — ${subject} — mon511.ca`,
        "Merci de nous avoir contactés! Ton ticket a bien été créé et notre équipe va te répondre par courriel sous peu.",
      )
      .catch(() => {});

    return ticket;
  }

  /** Billets de l'usager connecté, avec statut — pour la section « Mes
   * billets ». Réservé aux comptes connectés (comme « Mes signalements »). */
  async findMyTickets(userId: string) {
    return this.db
      .selectFrom('support_tickets')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async findMyTicketDetail(ticketId: string, userId: string) {
    const ticket = await this.db
      .selectFrom('support_tickets')
      .selectAll()
      .where('id', '=', ticketId)
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    const [replies, attachments] = await Promise.all([
      this.db.selectFrom('support_ticket_replies').selectAll().where('ticket_id', '=', ticketId).orderBy('created_at', 'asc').execute(),
      this.db.selectFrom('support_ticket_attachments').selectAll().where('ticket_id', '=', ticketId).execute(),
    ]);
    return { ticket, replies, attachments };
  }

  /** Marque un billet comme vu par son propriétaire — fait taire le flash
   * de l'icône Aide pour ce billet précis. */
  async markTicketSeen(ticketId: string, userId: string) {
    await this.db
      .updateTable('support_tickets')
      .set({ last_user_seen_at: new Date() as any })
      .where('id', '=', ticketId)
      .where('user_id', '=', userId)
      .execute();
  }

  /** L'usager peut fermer lui-même son billet — évite que l'équipe passe
   * du temps sur des cas déjà réglés que personne n'a pensé à signaler
   * comme résolus. */
  async closeOwnTicket(ticketId: string, userId: string) {
    await this.db
      .updateTable('support_tickets')
      .set({ status: 'resolved', resolved_at: new Date() as any, updated_at: new Date() as any })
      .where('id', '=', ticketId)
      .where('user_id', '=', userId)
      .execute();
  }

  async markConversationSeen(userId: string | null, sessionId: string | null) {
    let query = this.db.updateTable('support_conversations').set({ last_user_seen_at: new Date() as any });
    query = userId ? query.where('user_id', '=', userId) : query.where('session_id', '=', sessionId);
    await query.execute();
  }

  /** Un seul appel qui répond à « est-ce que l'icône Aide doit flasher? »
   * — vrai s'il existe une réponse de l'équipe (billet) ou un message de
   * l'assistant (chat) plus récent que la dernière visite de l'usager. */
  async getUnreadStatus(userId: string | null, sessionId: string | null) {
    if (!userId && !sessionId) return { hasUnread: false };

    let ticketQuery = this.db
      .selectFrom('support_tickets')
      .innerJoin('support_ticket_replies', 'support_ticket_replies.ticket_id', 'support_tickets.id')
      .select(({ fn }) => fn.count<number>('support_tickets.id').as('count'))
      .where('support_ticket_replies.author_type', '=', 'admin')
      .where((eb) =>
        eb.or([
          eb('support_tickets.last_user_seen_at', 'is', null),
          sql<boolean>`support_ticket_replies.created_at > support_tickets.last_user_seen_at`,
        ]),
      );
    ticketQuery = userId ? ticketQuery.where('support_tickets.user_id', '=', userId) : ticketQuery;
    const unreadTickets = userId ? await ticketQuery.executeTakeFirst() : { count: 0 };

    let convoQuery = this.db
      .selectFrom('support_conversations')
      .innerJoin('support_messages', 'support_messages.conversation_id', 'support_conversations.id')
      .select(({ fn }) => fn.count<number>('support_conversations.id').as('count'))
      .where('support_messages.role', '=', 'assistant')
      .where((eb) =>
        eb.or([
          eb('support_conversations.last_user_seen_at', 'is', null),
          sql<boolean>`support_messages.created_at > support_conversations.last_user_seen_at`,
        ]),
      );
    convoQuery = userId
      ? convoQuery.where('support_conversations.user_id', '=', userId)
      : convoQuery.where('support_conversations.session_id', '=', sessionId);
    const unreadConvo = await convoQuery.executeTakeFirst();

    return { hasUnread: Number(unreadTickets?.count ?? 0) > 0 || Number(unreadConvo?.count ?? 0) > 0 };
  }

  // ---------- Admin ----------

  async findAllTickets(status?: string) {
    let query = this.db.selectFrom('support_tickets').selectAll().orderBy('created_at', 'desc');
    if (status) query = query.where('status', '=', status as any);
    return query.execute();
  }

  async findTicketDetail(id: string) {
    const ticket = await this.db.selectFrom('support_tickets').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    const replies = await this.db.selectFrom('support_ticket_replies').selectAll().where('ticket_id', '=', id).orderBy('created_at', 'asc').execute();
    return { ticket, replies };
  }

  async replyToTicket(ticketId: string, adminId: string, message: string) {
    await this.db.insertInto('support_ticket_replies').values({ ticket_id: ticketId, author_type: 'admin', author_id: adminId, message }).execute();
    await this.db.updateTable('support_tickets').set({ status: 'in_progress', updated_at: new Date() as any }).where('id', '=', ticketId).execute();

    const ticket = await this.db.selectFrom('support_tickets').select('email').where('id', '=', ticketId).executeTakeFirst();
    if (ticket?.email) {
      this.email
        .send(ticket.email, 'Réponse à ton ticket de support — mon511.ca', message)
        .catch(() => {});
    }
  }

  async updateTicketStatus(ticketId: string, status: 'open' | 'in_progress' | 'resolved') {
    await this.db
      .updateTable('support_tickets')
      .set({ status, updated_at: new Date() as any, ...(status === 'resolved' && { resolved_at: new Date() as any }) })
      .where('id', '=', ticketId)
      .execute();
  }
}
