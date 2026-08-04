import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
