import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CustomerContact } from './entities/customer-contact.entity';
import { UsersService } from '../users/users.service';

const UNIQUE_VIOLATION_CODE = '23505';

export interface CustomerSelector {
  customerId?: string;
  customerContactId?: string;
  newCustomer?: {
    fullName: string;
    phone: string;
    email?: string;
    address?: string;
    note?: string;
  };
}

export interface ResolvedCustomerRef {
  customerId?: string;
  customerContactId?: string;
}

@Injectable()
export class CustomerContactsService {
  constructor(
    @InjectRepository(CustomerContact)
    private readonly repository: Repository<CustomerContact>,
    private readonly usersService: UsersService,
  ) {}

  async resolveSelector(
    ownerId: string,
    selector: CustomerSelector,
  ): Promise<ResolvedCustomerRef> {
    const provided = [selector.customerId, selector.customerContactId, selector.newCustomer].filter(
      (value) => value !== undefined && value !== null,
    );
    if (provided.length !== 1) {
      throw new BadRequestException(
        'Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer',
      );
    }

    if (selector.customerId) {
      const user = await this.usersService.findById(selector.customerId);
      if (!user) {
        throw new NotFoundException(`Khách hàng ${selector.customerId} không tồn tại`);
      }
      return { customerId: selector.customerId };
    }

    if (selector.customerContactId) {
      const contact = await this.findByIdForOwner(ownerId, selector.customerContactId);
      return { customerContactId: contact.id };
    }

    const contact = await this.findOrCreate(ownerId, selector.newCustomer!);
    return { customerContactId: contact.id };
  }

  async findByIdForOwner(ownerId: string, id: string): Promise<CustomerContact> {
    const contact = await this.repository.findOne({ where: { id, ownerId } });
    if (!contact) {
      throw new NotFoundException(`Khách hàng ${id} không tồn tại`);
    }
    return contact;
  }

  async findOrCreate(
    ownerId: string,
    data: { fullName: string; phone: string; email?: string; address?: string; note?: string },
  ): Promise<CustomerContact> {
    const existing = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
    if (existing) {
      existing.fullName = data.fullName;
      return this.repository.save(existing);
    }
    try {
      return await this.repository.save(
        this.repository.create({
          ownerId,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email ?? null,
          address: data.address ?? null,
          note: data.note ?? null,
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        const winner = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }

  async create(
    ownerId: string,
    data: { fullName: string; phone: string; email?: string; address?: string; note?: string },
  ): Promise<CustomerContact> {
    const existing = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
    if (existing) {
      throw new ConflictException(`Đã tồn tại khách hàng với số điện thoại ${data.phone}`);
    }
    try {
      return await this.repository.save(
        this.repository.create({
          ownerId,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email ?? null,
          address: data.address ?? null,
          note: data.note ?? null,
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException(`Đã tồn tại khách hàng với số điện thoại ${data.phone}`);
      }
      throw error;
    }
  }

  findById(id: string): Promise<CustomerContact | null> {
    return this.repository.findOne({ where: { id } });
  }
}
