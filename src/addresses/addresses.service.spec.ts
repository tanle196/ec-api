import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  const address = {
    id: 'address-1',
    user_id: 'user-1',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    addressLine1: '123 Đường Lê Lợi',
    addressLine2: null,
    city: 'Thành phố Hồ Chí Minh',
    province: 'Hồ Chí Minh',
    country: 'VN',
    postalCode: null,
    isDefault: false,
  };

  const buildService = () => {
    const repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data: object) => ({ ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const service = new AddressesService(repo as never);

    return { service, repo };
  };

  describe('findAllByUser', () => {
    it("returns the user's addresses, default first then oldest first", async () => {
      const { service, repo } = buildService();
      repo.find.mockResolvedValue([address]);

      const result = await service.findAllByUser('user-1');

      expect(result).toEqual([address]);
      expect(repo.find).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        order: { isDefault: 'DESC', createdAt: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the address when it belongs to the user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(address);

      const result = await service.findOne('address-1', 'user-1');

      expect(result).toBe(address);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'address-1' } });
    });

    it('throws NotFoundException when the address does not exist', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the address belongs to another user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...address, user_id: 'user-2' });

      await expect(service.findOne('address-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    const dto = {
      fullName: address.fullName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      city: address.city,
      province: address.province,
    };

    it('creates the address scoped to the user without touching other defaults', async () => {
      const { service, repo } = buildService();

      const result = await service.create('user-1', dto);

      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith({ ...dto, user_id: 'user-1' });
      expect(repo.save).toHaveBeenCalledWith({ ...dto, user_id: 'user-1' });
      expect(result).toEqual({ ...dto, user_id: 'user-1' });
    });

    it('clears existing defaults before saving a new default address', async () => {
      const { service, repo } = buildService();

      await service.create('user-1', { ...dto, isDefault: true });

      expect(repo.update).toHaveBeenCalledWith(
        { user_id: 'user-1' },
        { isDefault: false },
      );
      expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
    });

    it('ignores a client-supplied user_id and always uses the authenticated user', async () => {
      const { service, repo } = buildService();

      await service.create('user-1', { ...dto, user_id: 'user-2' } as never);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1' }),
      );
    });
  });

  describe('update', () => {
    it('updates the address and returns the refreshed record', async () => {
      const { service, repo } = buildService();
      const updated = { ...address, city: 'Hà Nội' };
      repo.findOne
        .mockResolvedValueOnce(address)
        .mockResolvedValueOnce(updated);

      const result = await service.update('address-1', 'user-1', {
        city: 'Hà Nội',
      });

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith('address-1', { city: 'Hà Nội' });
      expect(result).toBe(updated);
    });

    it('clears other defaults when the update marks the address as default', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(address);

      await service.update('address-1', 'user-1', { isDefault: true });

      expect(repo.update).toHaveBeenNthCalledWith(
        1,
        { user_id: 'user-1' },
        { isDefault: false },
      );
      expect(repo.update).toHaveBeenNthCalledWith(2, 'address-1', {
        isDefault: true,
      });
    });

    it('does not update when the address belongs to another user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...address, user_id: 'user-2' });

      await expect(
        service.update('address-1', 'user-1', { isDefault: true }),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the address does not exist', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', 'user-1', { city: 'Hà Nội' }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the address when it belongs to the user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(address);

      await service.remove('address-1', 'user-1');

      expect(repo.delete).toHaveBeenCalledWith('address-1');
    });

    it('does not delete when the address belongs to another user', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...address, user_id: 'user-2' });

      await expect(service.remove('address-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the address does not exist', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('clears other defaults, marks this one default, and returns it', async () => {
      const { service, repo } = buildService();
      const updated = { ...address, isDefault: true };
      repo.findOne
        .mockResolvedValueOnce(address)
        .mockResolvedValueOnce(updated);

      const result = await service.setDefault('address-1', 'user-1');

      expect(repo.update).toHaveBeenNthCalledWith(
        1,
        { user_id: 'user-1' },
        { isDefault: false },
      );
      expect(repo.update).toHaveBeenNthCalledWith(2, 'address-1', {
        isDefault: true,
      });
      expect(result).toBe(updated);
    });

    it("does not touch the user's defaults when the address belongs to another user", async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...address, user_id: 'user-2' });

      await expect(service.setDefault('address-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the address does not exist', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await expect(service.setDefault('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
