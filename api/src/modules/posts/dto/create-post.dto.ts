import { IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsIn(['road_conditions', 'community', 'general'])
  category: 'road_conditions' | 'community' | 'general';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  linkUrl?: string;

  @IsIn(['public', 'friends'])
  visibility: 'public' | 'friends';

  @IsOptional()
  @IsUUID()
  reportId?: string;
}
