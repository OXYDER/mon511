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
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactWebsite?: string;

  @IsOptional()
  @IsString()
  mailingAddress?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

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
