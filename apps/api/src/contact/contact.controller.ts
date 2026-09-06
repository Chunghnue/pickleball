import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('support-messages')
  @HttpCode(HttpStatus.CREATED)
  createSupportMessage(@Body() dto: CreateSupportMessageDto) {
    return this.contactService.createSupportMessage(dto);
  }

  @Post('partner-applications')
  @HttpCode(HttpStatus.CREATED)
  createPartnerApplication(@Body() dto: CreatePartnerApplicationDto) {
    return this.contactService.createPartnerApplication(dto);
  }
}
