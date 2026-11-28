import type { Address } from '@/addresses/entities/address.entity';

export type ShippingAddressSnapshot = Pick<
  Address,
  | 'fullName'
  | 'phone'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'province'
  | 'country'
  | 'postalCode'
  | 'districtCode'
  | 'wardCode'
>;

export function snapshotAddress(address: Address): ShippingAddressSnapshot {
  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2 ?? null,
    city: address.city,
    province: address.province,
    country: address.country,
    postalCode: address.postalCode ?? null,
    districtCode: address.districtCode ?? null,
    wardCode: address.wardCode ?? null,
  };
}
