import { IsUUID, IsString, IsOptional, IsNumber, IsIn, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsUUID()
  problemTypeId: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsOptional()
  @IsNumber()
  gpsAccuracyM?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Section "la municipalité a-t-elle été avisée ?" — voir maquette client
  @IsIn(['yes', 'no', 'unknown'])
  municipalityNotified: 'yes' | 'no' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  municipalityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipalityCaseNumber?: string;

  // Nom de municipalité détecté automatiquement par géolocalisation inverse
  // à la création — sert de repli pour associer le signalement à la bonne
  // municipalité tant qu'on n'a pas importé de vraies frontières
  // géographiques (voir reports.service.ts). Modifiable par la modération.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  municipalityHint?: string;
}
