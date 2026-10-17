import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AddressesController } from './addresses.controller';

describe('AddressesController', () => {
  const user = { id: 'user-1' };
  const address = { id: 'address-1', fullName: 'Nguyễn Văn A' };

  const buildController = () => {
    const addressesService = {
      findAllByUser: jest.fn().mockResolvedValue([address]),
      findOne: jest.fn().mockResolvedValue(address),
      create: jest.fn().mockResolvedValue(address),
      update: jest.fn().mockResolvedValue(address),
      remove: jest.fn().mockResolvedValue(undefined),
      setDefault: jest.fn().mockResolvedValue(address),
    };

    const controller = new AddressesController(addressesService as never);

    return { controller, addressesService };
  };

  it('is protected by JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AddressesController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  it('findAll lists addresses for the current user', async () => {
    const { controller, addressesService } = buildController();

    const result = await controller.findAll(user as never);

    expect(addressesService.findAllByUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([address]);
  });

  it('create creates an address for the current user', async () => {
    const { controller, addressesService } = buildController();
    const dto = {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      addressLine1: '123 Đường Lê Lợi',
      city: 'Thành phố Hồ Chí Minh',
      province: 'Hồ Chí Minh',
    };

    const result = await controller.create(user as never, dto);

    expect(addressesService.create).toHaveBeenCalledWith('user-1', dto);
    expect(result).toBe(address);
  });

  it('findOne fetches the address scoped to the current user', async () => {
    const { controller, addressesService } = buildController();

    const result = await controller.findOne(user as never, 'address-1');

    expect(addressesService.findOne).toHaveBeenCalledWith(
      'address-1',
      'user-1',
    );
    expect(result).toBe(address);
  });

  it('update updates the address scoped to the current user', async () => {
    const { controller, addressesService } = buildController();
    const dto = { city: 'Hà Nội' };

    const result = await controller.update(user as never, 'address-1', dto);

    expect(addressesService.update).toHaveBeenCalledWith(
      'address-1',
      'user-1',
      dto,
    );
    expect(result).toBe(address);
  });

  it('remove deletes the address scoped to the current user with 204', async () => {
    const { controller, addressesService } = buildController();

    await controller.remove(user as never, 'address-1');

    expect(addressesService.remove).toHaveBeenCalledWith('address-1', 'user-1');
    const handler = Object.getOwnPropertyDescriptor(
      AddressesController.prototype,
      'remove',
    )?.value as object;
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });

  it('setDefault marks the address as default for the current user', async () => {
    const { controller, addressesService } = buildController();

    const result = await controller.setDefault(user as never, 'address-1');

    expect(addressesService.setDefault).toHaveBeenCalledWith(
      'address-1',
      'user-1',
    );
    expect(result).toBe(address);
  });

  it('propagates service errors', async () => {
    const { controller, addressesService } = buildController();
    const error = new Error('boom');
    addressesService.findOne.mockRejectedValue(error);

    await expect(controller.findOne(user as never, 'address-1')).rejects.toBe(
      error,
    );
  });
});
