import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Usage : @Roles('moderator', 'admin', 'super_admin') au-dessus d'une route,
// combiné avec RolesGuard (voir guards/roles.guard.ts).
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
