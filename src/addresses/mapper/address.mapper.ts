import { AddressResponseDto } from '../dto/address-response.dto';
import { Address } from '../entities/address.entity';

export class AddressMapper {
  static toResponse = (entity: Address): AddressResponseDto => ({
    id: entity.id,
    fullName: entity.fullName,
    phone: entity.phone,
    addressLine1: entity.addressLine1,
    addressLine2: entity.addressLine2,
    city: entity.city,
    province: entity.province,
    country: entity.country,
    postalCode: entity.postalCode,
    isDefault: entity.isDefault,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Address[]): AddressResponseDto[] =>
    entities.map(AddressMapper.toResponse);
}
