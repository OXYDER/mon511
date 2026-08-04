import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpsertMunicipalityIntegrationDto {
  @IsUUID()
  regionId: string;

  @IsBoolean()
  autoSendEnabled: boolean;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  emailSubjectTemplate?: string;

  @IsOptional()
  @IsString()
  emailBodyTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  notifyCategoryIds?: string[];
}
