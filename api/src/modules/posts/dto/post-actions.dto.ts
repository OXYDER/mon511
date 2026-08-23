import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(1000)
  body: string;
}

export class RejectPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
