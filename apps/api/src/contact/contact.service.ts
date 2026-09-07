import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import { CreateNewsletterSubscriberDto } from './dto/create-newsletter-subscriber.dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(SupportMessage)
    private readonly supportMessagesRepository: Repository<SupportMessage>,
    @InjectRepository(PartnerApplication)
    private readonly partnerApplicationsRepository: Repository<PartnerApplication>,
    @InjectRepository(NewsletterSubscriber)
    private readonly newsletterSubscribersRepository: Repository<NewsletterSubscriber>,
  ) {}

  createSupportMessage(dto: CreateSupportMessageDto): Promise<SupportMessage> {
    return this.supportMessagesRepository.save(
      this.supportMessagesRepository.create({
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email ?? null,
        message: dto.message,
      }),
    );
  }

  createPartnerApplication(
    dto: CreatePartnerApplicationDto,
  ): Promise<PartnerApplication> {
    return this.partnerApplicationsRepository.save(
      this.partnerApplicationsRepository.create({
        ownerFullName: dto.ownerFullName,
        ownerPhone: dto.ownerPhone,
        ownerEmail: dto.ownerEmail,
        venueName: dto.venueName,
        address: dto.address,
        province: dto.province,
        ward: dto.ward ?? null,
        sportTypes: dto.sportTypes,
        courtCount: dto.courtCount,
        website: dto.website ?? null,
        note: dto.note ?? null,
      }),
    );
  }

  async subscribeNewsletter(
    dto: CreateNewsletterSubscriberDto,
  ): Promise<NewsletterSubscriber> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.newsletterSubscribersRepository.findOne({
      where: { email },
    });
    if (existing) return existing;
    try {
      return await this.newsletterSubscribersRepository.save(
        this.newsletterSubscribersRepository.create({ email }),
      );
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const found = await this.newsletterSubscribersRepository.findOne({
          where: { email },
        });
        if (found) return found;
      }
      throw err;
    }
  }
}
