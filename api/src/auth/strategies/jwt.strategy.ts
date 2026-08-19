import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// Évite une écriture en base à CHAQUE requête (trop coûteux) — on ne met
// à jour last_active_at que si la dernière mise à jour connue en mémoire
// date de plus de 2 minutes pour cet usager précis. Suffisant pour
// l'approximation "en ligne" (définie à 5 minutes côté application), et
// ne survit qu'un redémarrage du serveur, sans conséquence réelle.
const recentlyUpdated = new Map<string, number>();
const THROTTLE_MS = 2 * 60 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const last = recentlyUpdated.get(payload.sub);
    if (!last || Date.now() - last > THROTTLE_MS) {
      recentlyUpdated.set(payload.sub, Date.now());
      this.db
        .updateTable('users')
        .set({ last_active_at: new Date() as any })
        .where('id', '=', payload.sub)
        .execute()
        .catch(() => {});
    }

    // Le payload validé devient `request.user` — voir current-user.decorator.ts
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
