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
}
