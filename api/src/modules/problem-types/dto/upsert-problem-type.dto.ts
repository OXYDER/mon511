import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpsertProblemTypeDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(100)
  nameFr: string;

  @IsString()
  @MaxLength(100)
  nameEn: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  defaultSeverity?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
