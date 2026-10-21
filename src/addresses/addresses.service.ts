import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly repo: Repository<Address>,
  ) {}

  async findAllByUser(userId: string): Promise<Address[]> {
    return this.repo.find({
      where: { user_id: userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Address> {
    const address = await this.repo.findOne({ where: { id } });
    if (!address) throw new NotFoundException('Address not found');
    if (address.user_id !== userId) throw new ForbiddenException();
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    if (dto.isDefault) {
      await this.repo.update({ user_id: userId }, { isDefault: false });
    }

    const address = this.repo.create({ ...dto, user_id: userId });
    return this.repo.save(address);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const address = await this.findOne(id, userId);

    if (dto.isDefault) {
      await this.repo.update({ user_id: userId }, { isDefault: false });
    }

    await this.repo.update(address.id, dto);
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const address = await this.findOne(id, userId);
    await this.repo.delete(address.id);
  }

  async setDefault(id: string, userId: string): Promise<Address> {
    await this.findOne(id, userId);
    await this.repo.update({ user_id: userId }, { isDefault: false });
    await this.repo.update(id, { isDefault: true });
    return this.findOne(id, userId);
  }
}
