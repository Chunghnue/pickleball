import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerTier, buildCustomerCode, classifyTier } from './customer-classification';
import { ListCustomersDto } from './dto/list-customers.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

export type CustomerKind = 'registered' | 'walkin';

export interface CustomerListItem {
  kind: CustomerKind;
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null;
  tier: CustomerTier;
  customerCode: string;
}

export interface CustomerSummary {
  totalCustomers: number;
  vipCustomers: number;
  totalBookings: number;
  totalSpent: number;
}

export interface CustomerDetail extends CustomerListItem {
  email?: string;
  address?: string;
  note?: string;
  joinedAt: string;
}

interface RawCustomerRow {
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: string;
  totalSpent: string;
  lastBookingAt: string | null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(CustomerContact)
    private readonly contactsRepository: Repository<CustomerContact>,
    private readonly customerContactsService: CustomerContactsService,
    private readonly usersService: UsersService,
  ) {}

  private async resolveCourtIds(ownerId: string, venueId?: string): Promise<string[]> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);
    if (venueIds.length === 0) return [];
    const courts = await this.courtsRepository.find({ where: { venueId: In(venueIds) } });
    return courts.map((c) => c.id);
  }

  private toItem(kind: CustomerKind, row: RawCustomerRow): CustomerListItem {
    const totalBookings = Number(row.totalBookings);
    const totalSpent = Number(row.totalSpent);
    return {
      kind,
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      totalBookings,
      totalSpent,
      lastBookingAt: row.lastBookingAt,
      tier: classifyTier(totalBookings, totalSpent),
      customerCode: buildCustomerCode(row.id),
    };
  }

  async aggregateCustomers(ownerId: string, venueId?: string): Promise<CustomerListItem[]> {
    const courtIds = await this.resolveCourtIds(ownerId, venueId);

    const registeredRows =
      courtIds.length === 0
        ? []
        : await this.bookingsRepository
            .createQueryBuilder('booking')
            .innerJoin('users', 'customer', 'customer.id::text = booking.customer_id')
            .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
            .select('booking.customer_id', 'id')
            .addSelect('customer.full_name', 'fullName')
            .addSelect('customer.phone', 'phone')
            .addSelect("COUNT(*) FILTER (WHERE booking.status <> 'cancelled')", 'totalBookings')
            .addSelect(
              "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
              'totalSpent',
            )
            .addSelect(
              "TO_CHAR(MAX(booking.date) FILTER (WHERE booking.status <> 'cancelled'), 'YYYY-MM-DD')",
              'lastBookingAt',
            )
            .where('booking.court_id IN (:...courtIds)', { courtIds })
            .andWhere('booking.customer_id IS NOT NULL')
            .groupBy('booking.customer_id')
            .addGroupBy('customer.full_name')
            .addGroupBy('customer.phone')
            .getRawMany<RawCustomerRow>();

    const walkinJoin = courtIds.length
      ? 'booking.customer_contact_id = contact.id AND booking.court_id IN (:...courtIds)'
      : 'booking.customer_contact_id = contact.id AND 1 = 0';
    const walkinRows = await this.contactsRepository
      .createQueryBuilder('contact')
      .leftJoin('bookings', 'booking', walkinJoin, courtIds.length ? { courtIds } : {})
      .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
      .select('contact.id', 'id')
      .addSelect('contact.full_name', 'fullName')
      .addSelect('contact.phone', 'phone')
      .addSelect("COUNT(booking.id) FILTER (WHERE booking.status <> 'cancelled')", 'totalBookings')
      .addSelect(
        "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
        'totalSpent',
      )
      .addSelect(
        "TO_CHAR(MAX(booking.date) FILTER (WHERE booking.status <> 'cancelled'), 'YYYY-MM-DD')",
        'lastBookingAt',
      )
      .where('contact.owner_id = :ownerId', { ownerId })
      .groupBy('contact.id')
      .addGroupBy('contact.full_name')
      .addGroupBy('contact.phone')
      .getRawMany<RawCustomerRow>();

    return [
      ...registeredRows.map((row) => this.toItem('registered', row)),
      ...walkinRows.map((row) => this.toItem('walkin', row)),
    ];
  }

  async listCustomers(
    ownerId: string,
    dto: ListCustomersDto,
  ): Promise<{ items: CustomerListItem[]; total: number; page: number; pageSize: number }> {
    const all = await this.aggregateCustomers(ownerId, dto.venueId);

    const tier = dto.tier && dto.tier !== 'all' ? dto.tier : null;
    const search = dto.search?.trim().toLowerCase();

    let filtered = all;
    if (tier) {
      filtered = filtered.filter((c) => c.tier === tier);
    }
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(search) ||
          (c.phone ?? '').toLowerCase().includes(search),
      );
    }

    filtered = [...filtered].sort((a, b) => {
      if (a.lastBookingAt && b.lastBookingAt) {
        if (a.lastBookingAt !== b.lastBookingAt) {
          return a.lastBookingAt < b.lastBookingAt ? 1 : -1; // desc
        }
      } else if (a.lastBookingAt) {
        return -1; // a booked, b never → a first
      } else if (b.lastBookingAt) {
        return 1;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    const page = clampPage(dto.page);
    const pageSize = clampPageSize(dto.pageSize);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async getSummary(ownerId: string, venueId?: string): Promise<CustomerSummary> {
    const customers = await this.aggregateCustomers(ownerId, venueId);
    return {
      totalCustomers: customers.length,
      vipCustomers: customers.filter((c) => c.tier === 'vip').length,
      totalBookings: customers.reduce((sum, c) => sum + c.totalBookings, 0),
      totalSpent: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    };
  }

  async getCustomerDetail(ownerId: string, kind: string, id: string): Promise<CustomerDetail> {
    if (kind !== 'registered' && kind !== 'walkin') {
      throw new NotFoundException('Khách hàng không tồn tại');
    }

    const all = await this.aggregateCustomers(ownerId);
    const row = all.find((c) => c.kind === kind && c.id === id);
    if (!row) {
      throw new NotFoundException('Khách hàng không tồn tại');
    }

    if (kind === 'walkin') {
      const contact = await this.customerContactsService.findByIdForOwner(ownerId, id);
      return {
        ...row,
        email: contact.email ?? undefined,
        address: contact.address ?? undefined,
        note: contact.note ?? undefined,
        joinedAt: contact.createdAt.toISOString(),
      };
    }

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Khách hàng không tồn tại');
    }
    return {
      ...row,
      email: user.email ?? undefined,
      joinedAt: user.createdAt.toISOString(),
    };
  }
}
