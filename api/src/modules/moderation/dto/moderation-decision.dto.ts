import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ModerationDecisionDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  // Motif obligatoire pour un refus — voir modèle de données §11 et la
  // contrainte SQL `reason_required_on_rejection` qui applique la même
  // règle en base, en filet de sécurité au cas où l'API serait contournée.
  @ValidateIf((o) => o.decision === 'reject')
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReplyMessageDto {
  @IsString()
  @MaxLength(1000)
  message: string;
}
