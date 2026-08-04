import { Inject, Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Kysely } from 'kysely';
import * as bcrypt from 'bcrypt';
import { Database } from '../database/schema';
import { KYSELY_INSTANCE } from '../database/database.module';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly jwt: JwtService,
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
      })
      .returning(['id', 'email'])
      .executeTakeFirstOrThrow();

    return this.issueToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'password_hash', 'status'])
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

    return this.issueToken(user.id, user.email);
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
