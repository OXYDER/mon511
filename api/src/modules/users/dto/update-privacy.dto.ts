import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  showReputation?: boolean;

  @IsOptional()
  @IsBoolean()
  showReportHistory?: boolean;

  @IsOptional()
  @IsBoolean()
  showRegion?: boolean;

  @IsOptional()
  @IsBoolean()
  showRealName?: boolean;

  @IsOptional()
  @IsIn(['full', 'initial', 'hidden'])
  lastNameDisplay?: 'full' | 'initial' | 'hidden';

  @IsOptional()
  @IsIn(['everyone', 'shared_reports_only'])
  dmPermission?: 'everyone' | 'shared_reports_only';

  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;
}
