import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplatesModule } from '../modules/email-templates/email-templates.module';

@Global()
@Module({
  imports: [EmailTemplatesModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
