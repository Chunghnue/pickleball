import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { User, UserRole, UserStatus } from '../../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../../src/payments/entities/payment.entity';
import { CustomerContact } from '../../src/customer-contacts/entities/customer-contact.entity';

export async function createUser(
  ds: DataSource,
  email: string,
  role: UserRole,
  status: UserStatus = UserStatus.ACTIVE,
): Promise<User> {
  const passwordHash = await bcrypt.hash('password123', 10);
  const repo = ds.getRepository(User);
  return repo.save(
    repo.create({
      email,
      passwordHash,
      fullName: `User ${email}`,
      phone: '0900000000',
      role,
      status,
      emailVerified: true,
    }),
  );
}

export async function loginAs(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

export async function createVenue(ds: DataSource, ownerId: string, name: string): Promise<Venue> {
  const repo = ds.getRepository(Venue);
  return repo.save(
    repo.create({ ownerId, name, address: '123 Le Loi', city: 'Ho Chi Minh', status: VenueStatus.ACTIVE }),
  );
}

export async function createCourt(
  ds: DataSource,
  venueId: string,
  name: string,
  isActive = true,
): Promise<Court> {
  const repo = ds.getRepository(Court);
  return repo.save(
    repo.create({
      venueId,
      name,
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      status: isActive ? CourtStatus.ACTIVE : CourtStatus.CLOSED,
    }),
  );
}

export async function createContact(
  ds: DataSource,
  ownerId: string,
  fullName: string,
  phone: string,
  extra: { email?: string; address?: string; note?: string } = {},
): Promise<CustomerContact> {
  const repo = ds.getRepository(CustomerContact);
  return repo.save(
    repo.create({
      ownerId,
      fullName,
      phone,
      email: extra.email ?? null,
      address: extra.address ?? null,
      note: extra.note ?? null,
    }),
  );
}

export async function createBooking(
  ds: DataSource,
  courtId: string,
  opts: {
    customerId?: string;
    customerContactId?: string;
    totalPrice?: number;
    date?: string;
    status?: BookingStatus;
  },
): Promise<Booking> {
  const repo = ds.getRepository(Booking);
  return repo.save(
    repo.create({
      courtId,
      customerId: opts.customerId ?? null,
      customerContactId: opts.customerContactId ?? null,
      date: opts.date ?? '2026-08-29',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: opts.totalPrice ?? 100000,
      status: opts.status ?? BookingStatus.CONFIRMED,
    }),
  );
}

export async function payBooking(ds: DataSource, bookingId: string): Promise<Payment> {
  const repo = ds.getRepository(Payment);
  return repo.save(repo.create({ bookingId, status: PaymentStatus.PAID, paidAt: new Date() }));
}
