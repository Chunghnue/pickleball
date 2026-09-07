import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ContactService } from './contact.service';
import { SupportMessage } from './entities/support-message.entity';
import { PartnerApplication } from './entities/partner-application.entity';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';

const passThroughRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 'n1', createdAt: new Date(), ...(data as object) }),
  ),
});

async function buildService() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ContactService,
      { provide: getRepositoryToken(SupportMessage), useFactory: passThroughRepo },
      { provide: getRepositoryToken(PartnerApplication), useFactory: passThroughRepo },
      { provide: getRepositoryToken(NewsletterSubscriber), useFactory: passThroughRepo },
    ],
  }).compile();

  return {
    service: module.get(ContactService),
    newsletterRepo: module.get(getRepositoryToken(NewsletterSubscriber)),
  };
}

describe('ContactService.subscribeNewsletter', () => {
  it('normalizes the email and saves a new subscriber', async () => {
    const { service, newsletterRepo } = await buildService();
    newsletterRepo.findOne.mockResolvedValue(null);

    await service.subscribeNewsletter({ email: '  User@Example.COM ' });

    expect(newsletterRepo.create).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(newsletterRepo.save).toHaveBeenCalled();
  });

  it('returns the existing subscriber without saving when the email already exists', async () => {
    const { service, newsletterRepo } = await buildService();
    const existing = { id: 'n1', email: 'user@example.com', createdAt: new Date() };
    newsletterRepo.findOne.mockResolvedValue(existing);

    const result = await service.subscribeNewsletter({ email: 'USER@example.com' });

    expect(result).toBe(existing);
    expect(newsletterRepo.save).not.toHaveBeenCalled();
  });

  it('recovers by re-fetching when a concurrent insert wins the race', async () => {
    const { service, newsletterRepo } = await buildService();
    const winner = { id: 'n2', email: 'race@example.com', createdAt: new Date() };
    newsletterRepo.findOne
      .mockResolvedValueOnce(null) // initial lookup: not found
      .mockResolvedValueOnce(winner); // after unique violation: found
    newsletterRepo.save.mockRejectedValueOnce(
      new QueryFailedError('insert', [], new Error('duplicate key')),
    );

    const result = await service.subscribeNewsletter({ email: 'race@example.com' });

    expect(result).toBe(winner);
  });
});
