import { IsString, IsUUID, MaxLength } from 'class-validator';

export class StartConversationDto {
  @IsUUID()
  toUserId: string;

  @IsString()
  @MaxLength(2000)
  message: string;
}

export class SendMessageDto {
  @IsString()
  @MaxLength(2000)
  message: string;
}
