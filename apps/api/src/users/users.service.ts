import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';

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

  approveOwner(id: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.ACTIVE);
  }

  rejectOwner(id: string): Promise<User> {
    return this.transitionOwnerStatus(id, UserStatus.REJECTED);
  }

  private async transitionOwnerStatus(
    id: string,
    nextStatus: UserStatus,
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
    return this.usersRepository.save(user);
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
    updates: { fullName?: string; phone?: string; avatarUrl?: string },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    return this.usersRepository.save(user);
  }
}
