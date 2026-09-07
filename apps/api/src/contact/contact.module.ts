import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportMessage,
      PartnerApplication,
      NewsletterSubscriber,
    ]),
  ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
