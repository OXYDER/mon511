import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Comme JwtAuthGuard, mais ne lance jamais d'exception si le jeton est
 * absent ou invalide — request.user devient simplement undefined dans ce
 * cas. Utile pour les routes publiques qui veulent quand même savoir "qui"
 * demande, quand c'est disponible (ex. montrer à l'auteur son propre
 * signalement en attente d'approbation, invisible pour tout le monde).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
