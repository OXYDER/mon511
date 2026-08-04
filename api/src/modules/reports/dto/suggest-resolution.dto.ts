import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestResolutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
