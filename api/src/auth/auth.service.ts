import { Inject, Injectable, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Kysely } from 'kysely';
import * as bcrypt from 'bcrypt';
import { Database } from '../database/schema';
import { KYSELY_INSTANCE } from '../database/database.module';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerificationService } from '../verification/verification.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly jwt: JwtService,
    private readonly verification: VerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', dto.email)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce courriel.');
    }

    const defaultRole = await this.db
      .selectFrom('roles')
      .select('id')
      .where('name', '=', 'user')
      .executeTakeFirstOrThrow();

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.db
      .insertInto('users')
      .values({
        email: dto.email,
        password_hash: passwordHash,
        first_name: dto.firstName ?? null,
        last_name: dto.lastName ?? null,
        region_id: dto.regionId ?? null,
        role_id: defaultRole.id,
        email_verified: false,
      })
      .returning(['id', 'email'])
      .executeTakeFirstOrThrow();

    await this.verification.createAndSend(
      user.email,
      'signup',
      'Confirme ton compte mon511.ca',
      'Bienvenue sur mon511.ca ! Pour activer ton compte, entre ce code dans l\'application.',
      user.id,
    );

    return { pendingVerification: true, email: user.email };
  }

  async verifyEmail(email: string, code: string) {
    await this.verification.verify(email, 'signup', code);
    const user = await this.db
      .updateTable('users')
      .set({ email_verified: true })
      .where('email', '=', email)
      .returning(['id', 'email'])
      .executeTakeFirst();

    if (!user) throw new UnauthorizedException('Compte introuvable.');
    return this.issueToken(user.id, user.email);
  }

  async resendSignupCode(email: string) {
    const user = await this.db.selectFrom('users').select(['id', 'email', 'email_verified']).where('email', '=', email).executeTakeFirst();
    if (!user || user.email_verified) return { sent: true }; // ne pas révéler si le compte existe ou non
    await this.verification.createAndSend(
      user.email,
      'signup',
      'Ton nouveau code mon511.ca',
      'Voici un nouveau code pour activer ton compte.',
      user.id,
    );
    return { sent: true };
  }

  async login(dto: LoginDto) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'status', 'email_verified'])
      .where('email', '=', dto.email)
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Ce compte est suspendu ou banni.');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    if (!user.email_verified) {
      throw new ForbiddenException('Ce compte n\'est pas encore vérifié — consulte ton courriel pour le code d\'activation.');
    }

    return this.issueToken(user.id, user.email);
  }

  async forgotPassword(email: string) {
    const user = await this.db.selectFrom('users').select(['id', 'email']).where('email', '=', email).executeTakeFirst();
    // Réponse identique que le compte existe ou non — ne jamais révéler
    // si une adresse est enregistrée chez nous.
    if (user) {
      await this.verification.createAndSend(
        user.email,
        'password_reset',
        'Réinitialiser ton mot de passe mon511.ca',
        'Une demande de réinitialisation de mot de passe a été faite pour ce compte.',
        user.id,
      );
    }
    return { sent: true };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    await this.verification.verify(email, 'password_reset', code);
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.updateTable('users').set({ password_hash: newHash, updated_at: new Date() as any }).where('email', '=', email).execute();
    return { reset: true };
  }

  private async issueToken(userId: string, email: string) {
    const role = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('roles.name as roleName')
      .where('users.id', '=', userId)
      .executeTakeFirstOrThrow();

    const accessToken = this.jwt.sign({ sub: userId, email, role: role.roleName });
    return { accessToken, user: { id: userId, email, role: role.roleName } };
  }
}
