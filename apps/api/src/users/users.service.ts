import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { Booking } from '../bookings/entities/booking.entity';
import {
  CustomerTier,
  classifyTier,
} from '../customers/customer-classification';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = this.usersRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerified: false,
    });
    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.usersRepository.find({ where: { id: In(ids) } });
  }

  async markVerified(userId: string, nextStatus: UserStatus): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    user.emailVerified = true;
    user.status = nextStatus;
    return this.usersRepository.save(user);
  }

  findPendingOwners(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
    });
  }

  findActiveOwners(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
    });
  }

  approveOwner(id: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.ACTIVE);
  }

  rejectOwner(id: string, reason?: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.REJECTED, reason);
  }

  private async transitionOwnerStatus(
    id: string,
    nextStatus: UserStatus,
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user || user.role !== UserRole.OWNER) {
      throw new NotFoundException(`Owner ${id} not found`);
    }
    if (user.status !== UserStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối tài khoản đang chờ duyệt',
      );
    }
    user.status = nextStatus;
    const saved = await this.usersRepository.save(user);
    // this method only ever transitions role='owner' accounts (checked above),
    // which always register with email — only staff accounts can be null.
    if (nextStatus === UserStatus.ACTIVE) {
      await this.notificationsService.notifyOwnerApproved({
        to: saved.email!,
        fullName: saved.fullName,
      });
    } else {
      await this.notificationsService.notifyOwnerRejected({
        to: saved.email!,
        fullName: saved.fullName,
        reason,
      });
    }
    return saved;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
  }

  async updateProfile(
    userId: string,
    updates: {
      fullName?: string;
      phone?: string;
      avatarUrl?: string;
      address?: string;
    },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    if (updates.address !== undefined) user.address = updates.address;
    return this.usersRepository.save(user);
  }

  async getStats(userId: string): Promise<{
    totalBookings: number;
    totalSpent: number;
    tier: CustomerTier;
  }> {
    const row = await this.bookingsRepository
      .createQueryBuilder('booking')
      .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
      .select(
        "COUNT(*) FILTER (WHERE booking.status <> 'cancelled')",
        'totalBookings',
      )
      .addSelect(
        "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
        'totalSpent',
      )
      .where('booking.customer_id = :userId', { userId })
      .getRawOne<{ totalBookings: string; totalSpent: string }>();

    const totalBookings = Number(row?.totalBookings ?? 0);
    const totalSpent = Number(row?.totalSpent ?? 0);
    return {
      totalBookings,
      totalSpent,
      tier: classifyTier(totalBookings, totalSpent),
    };
  }
}
