import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { SUPPORT_KNOWLEDGE_BASE } from './support-knowledge-base';
import { EmailService } from '../../email/email.service';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
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

    let ticketId: string | null = null;
    if (escalate) {
      const ticket = await this.createTicketFromConversation(conversation.id, userId, userEmail, history);
      ticketId = ticket.id;
    }

    return { conversationId: conversation.id, reply, escalate, ticketId };
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

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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
        this.logger.error(`Gemini a répondu ${res.status} : ${body.slice(0, 300)}`);
        return { reply: "Notre assistant est temporairement surchargé. Je te propose de créer un ticket — notre équipe va te répondre directement.", escalate: true };
      }

      const data = await res.json();
      const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const escalate = rawText.includes(ESCALATE_MARKER);
      const reply = rawText.replace(ESCALATE_MARKER, '').trim() || "Je ne suis pas certain de pouvoir répondre à ça — je te propose de créer un ticket pour que notre équipe s'en occupe directement.";

      return { reply, escalate };
    } catch (error) {
      this.logger.error("Échec de l'appel à Gemini", error as Error);
      return { reply: "Une erreur technique est survenue. Je te propose de créer un ticket — notre équipe va te répondre directement.", escalate: true };
    }
  }

  private async createTicketFromConversation(
    conversationId: string,
    userId: string | null,
    userEmail: string | null,
    history: { role: string; content: string }[],
  ) {
    const firstUserMessage = history.find((m) => m.role === 'user')?.content ?? 'Question du chat de support';
    const transcript = history.map((m) => `${m.role === 'user' ? 'Usager' : 'Assistant'} : ${m.content}`).join('\n\n');

    const ticket = await this.db
      .insertInto('support_tickets')
      .values({
        conversation_id: conversationId,
        user_id: userId,
        email: userEmail ?? 'inconnu@mon511.ca',
        subject: firstUserMessage.slice(0, 120),
        description: transcript,
        created_by: 'ai',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (userEmail) {
      this.email
        .send(
          userEmail,
          'Ton ticket de support a été créé — mon511.ca',
          "Merci d'avoir contacté notre support! Un ticket a été créé à partir de notre échange, et notre équipe va te répondre par courriel sous peu.",
        )
        .catch(() => {});
    }

    return ticket;
  }

  /** Création manuelle d'un ticket (formulaire de contact direct, sans
   * passer par le chat). */
  async createManualTicket(userId: string | null, email: string, name: string | undefined, subject: string, description: string) {
    return this.db
      .insertInto('support_tickets')
      .values({ user_id: userId, email, name: name ?? null, subject, description, created_by: 'user' })
      .returningAll()
      .executeTakeFirstOrThrow();
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
