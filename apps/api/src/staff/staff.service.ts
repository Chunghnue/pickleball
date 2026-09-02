import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { StaffRole, User, UserRole, UserStatus } from '../users/entities/user.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffDto } from './dto/list-staff.dto';

export interface StaffListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: UserRole.OWNER | UserRole.STAFF;
  staffRole: StaffRole | null;
  status: UserStatus;
}

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(ownerId: string, dto: CreateStaffDto): Promise<StaffListItem> {
    await this.assertPhoneAvailable(dto.phone);
    if (dto.email) {
      await this.assertEmailAvailable(dto.email);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const staff = this.usersRepository.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email ?? null,
      passwordHash,
      role: UserRole.STAFF,
      ownerId,
      staffRole: dto.staffRole,
      status: UserStatus.ACTIVE,
      emailVerified: false,
    });
    const saved = await this.usersRepository.save(staff);
    return this.toListItem(saved);
  }

  async list(ownerId: string, query: ListStaffDto): Promise<StaffListItem[]> {
    const owner = await this.usersRepository.findOne({ where: { id: ownerId } });
    const staff = await this.usersRepository.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });
    let items = [owner, ...staff].filter((u): u is User => !!u);

    if (query.staffRole) {
      items = items.filter((u) => u.staffRole === query.staffRole);
    }
    if (query.search) {
      const s = query.search.trim().toLowerCase();
      items = items.filter(
        (u) =>
          u.fullName.toLowerCase().includes(s) ||
          (u.phone ?? '').toLowerCase().includes(s) ||
          (u.email ?? '').toLowerCase().includes(s),
      );
    }

    return items.map((u) => this.toListItem(u));
  }

  async getOwnedStaffOrThrow(ownerId: string, staffId: string): Promise<User> {
    const staff = await this.usersRepository.findOne({
      where: { id: staffId, ownerId, role: UserRole.STAFF },
    });
    if (!staff) {
      throw new NotFoundException(`Nhân viên ${staffId} không tồn tại`);
    }
    return staff;
  }

  private async assertPhoneAvailable(phone: string, excludeId?: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { phone } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Số điện thoại đã được sử dụng');
    }
  }

  private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Email đã được sử dụng');
    }
  }

  private toListItem(user: User): StaffListItem {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role as UserRole.OWNER | UserRole.STAFF,
      staffRole: user.staffRole,
      status: user.status,
    };
  }
}
