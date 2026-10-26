import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

describe('Address DTOs', () => {
  const validPayload = {
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    addressLine1: '123 Đường Lê Lợi',
    city: 'Thành phố Hồ Chí Minh',
    province: 'Hồ Chí Minh',
  };

  const errorProps = async (cls: new () => object, payload: object) => {
    const errors = await validate(plainToInstance(cls, payload));
    return errors.map((e) => e.property);
  };

  describe('CreateAddressDto', () => {
    it('accepts a payload with only the required fields', async () => {
      expect(await errorProps(CreateAddressDto, validPayload)).toEqual([]);
    });

    it('accepts all optional fields', async () => {
      expect(
        await errorProps(CreateAddressDto, {
          ...validPayload,
          addressLine2: 'Phường Bến Nghé',
          country: 'VN',
          postalCode: '700000',
          isDefault: true,
        }),
      ).toEqual([]);
    });

    it.each(['fullName', 'phone', 'addressLine1', 'city', 'province'])(
      'rejects a missing %s',
      async (field) => {
        const payload: Record<string, unknown> = { ...validPayload };
        delete payload[field];

        expect(await errorProps(CreateAddressDto, payload)).toEqual([field]);
      },
    );

    it.each(['fullName', 'phone', 'addressLine1', 'city', 'province'])(
      'rejects an empty %s',
      async (field) => {
        expect(
          await errorProps(CreateAddressDto, { ...validPayload, [field]: '' }),
        ).toEqual([field]);
      },
    );

    it('rejects a non-boolean isDefault', async () => {
      expect(
        await errorProps(CreateAddressDto, {
          ...validPayload,
          isDefault: 'true',
        }),
      ).toEqual(['isDefault']);
    });

    it('rejects non-string optional fields', async () => {
      expect(
        await errorProps(CreateAddressDto, {
          ...validPayload,
          postalCode: 700000,
        }),
      ).toEqual(['postalCode']);
    });
  });

  describe('UpdateAddressDto', () => {
    it('accepts an empty payload', async () => {
      expect(await errorProps(UpdateAddressDto, {})).toEqual([]);
    });

    it('accepts a partial payload', async () => {
      expect(
        await errorProps(UpdateAddressDto, { city: 'Hà Nội', isDefault: true }),
      ).toEqual([]);
    });

    it('still validates the types of provided fields', async () => {
      expect(
        await errorProps(UpdateAddressDto, { phone: 123, isDefault: 'yes' }),
      ).toEqual(['phone', 'isDefault']);
    });
  });
});
