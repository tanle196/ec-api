import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminMediaController } from './admin-media.controller';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminMediaController.prototype, method)
      ?.value as object,
  ) as string[];

describe('AdminMediaController', () => {
  const service = {
    uploadOne: jest.fn().mockResolvedValue({ url: 'u' }),
    uploadMany: jest.fn().mockResolvedValue([{ url: 'a' }, { url: 'b' }]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new AdminMediaController(service as never);

  it('is protected by JwtAuthGuard and PermissionsGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminMediaController)).toEqual([
      JwtAuthGuard,
      PermissionsGuard,
    ]);
  });

  it.each([
    ['uploadOne', 'media.upload'],
    ['uploadMany', 'media.upload'],
    ['remove', 'media.delete'],
  ])('%s requires %s', (method, perm) => {
    expect(permissionsOf(method)).toEqual([perm]);
  });

  it('uploadOne returns the upload result', async () => {
    const f = { originalname: 'x' } as never;

    await expect(controller.uploadOne(f)).resolves.toEqual({ url: 'u' });
    expect(service.uploadOne).toHaveBeenCalledWith(f);
  });

  it('uploadMany wraps results in { files }', async () => {
    await expect(controller.uploadMany([] as never)).resolves.toEqual({
      files: [{ url: 'a' }, { url: 'b' }],
    });
  });

  it('remove deletes by publicId', async () => {
    await expect(controller.remove('ec-api/abc')).resolves.toEqual({
      success: true,
    });
    expect(service.delete).toHaveBeenCalledWith('ec-api/abc');
  });
});
