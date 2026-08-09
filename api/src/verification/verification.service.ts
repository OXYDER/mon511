import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import * as bcrypt from 'bcrypt';
import { Database } from '../database/schema';
import { KYSELY_INSTANCE } from '../database/database.module';
import { EmailService } from '../email/email.service';

type Purpose = 'signup' | 'email_change' | 'password_change' | 'password_reset';

const TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const CODE_ROUNDS = 10;

@Injectable()
export class VerificationService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly email: EmailService,
  ) {}

  private generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
  }

  /**
   * Crée un code, l'envoie par courriel, et retourne l'id de la ligne créée.
   */
  async createAndSend(
    email: string,
    purpose: Purpose,
    subject: string,
    bodyIntro: string,
    userId?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, CODE_ROUNDS);
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

    const row = await this.db
      .insertInto('verification_codes')
      .values({
        user_id: userId ?? null,
        email,
        purpose,
        code_hash: codeHash,
        metadata: metadata ?? null,
        expires_at: expiresAt as any,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await this.email.send(
      email,
      subject,
      `${bodyIntro}\n\nTon code de vérification : ${code}\n\nCe code expire dans ${TTL_MINUTES} minutes. Si tu n'es pas à l'origine de cette demande, ignore simplement ce courriel.`,
    );

    return row.id;
  }

  /**
   * Vérifie un code pour une adresse/objectif donné. Lance une exception
   * claire en cas d'échec (code invalide, expiré, ou déjà utilisé) plutôt
   * que de retourner un booléen silencieux. Limite les tentatives pour
   * ralentir le devinage par force brute.
   */
  async verify(email: string, purpose: Purpose, code: string): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom('verification_codes')
      .selectAll()
      .where('email', '=', email)
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (!row) throw new BadRequestException('Aucun code en attente pour cette adresse — demande-en un nouveau.');
    if (new Date(row.expires_at as any) < new Date()) throw new BadRequestException('Ce code a expiré — demande-en un nouveau.');
    if (row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Trop de tentatives — demande un nouveau code.');

    const valid = await bcrypt.compare(code, row.code_hash);
    if (!valid) {
      await this.db.updateTable('verification_codes').set({ attempts: row.attempts + 1 }).where('id', '=', row.id).execute();
      throw new BadRequestException('Code incorrect.');
    }

    await this.db.updateTable('verification_codes').set({ used_at: new Date() as any }).where('id', '=', row.id).execute();
    return (row.metadata as Record<string, unknown>) ?? null;
  }
}
