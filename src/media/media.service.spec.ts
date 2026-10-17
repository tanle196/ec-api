import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const file = (overrides: object = {}) =>
    ({
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
      ...overrides,
    }) as Express.Multer.File;

  const buildService = () => {
    const storageProvider = {
      upload: jest.fn((f: Express.Multer.File) =>
        Promise.resolve({ url: `u/${f.originalname}`, publicId: 'id' }),
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      getMediaConfig: () => ({
        maxFileSizeBytes: 2 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg'],
      }),
    };
    const service = new MediaService(storageProvider as never, config as never);
    return { service, storageProvider };
  };

  it('uploads a valid file to the given folder', async () => {
    const { service, storageProvider } = buildService();
    const f = file();

    await expect(service.uploadOne(f, 'banners')).resolves.toEqual({
      url: 'u/photo.png',
      publicId: 'id',
    });
    expect(storageProvider.upload).toHaveBeenCalledWith(f, 'banners');
  });

  it('rejects files over the size limit', async () => {
    const { service, storageProvider } = buildService();

    await expect(
      service.uploadOne(file({ size: 3 * 1024 * 1024 })),
    ).rejects.toThrow(
      'File "photo.png" exceeds the maximum allowed size of 2MB',
    );
    expect(storageProvider.upload).not.toHaveBeenCalled();
  });

  it('rejects disallowed mime types', async () => {
    const { service } = buildService();

    await expect(
      service.uploadOne(file({ mimetype: 'application/pdf' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('uploadMany validates every file before uploading any', async () => {
    const { service, storageProvider } = buildService();

    await expect(
      service.uploadMany([file(), file({ mimetype: 'text/html' })]),
    ).rejects.toThrow(BadRequestException);
    expect(storageProvider.upload).not.toHaveBeenCalled();
  });

  it('uploadMany uploads all valid files', async () => {
    const { service } = buildService();

    await expect(
      service.uploadMany([
        file(),
        file({ originalname: 'b.jpg', mimetype: 'image/jpeg' }),
      ]),
    ).resolves.toEqual([
      { url: 'u/photo.png', publicId: 'id' },
      { url: 'u/b.jpg', publicId: 'id' },
    ]);
  });

  it('delete delegates to the storage provider', async () => {
    const { service, storageProvider } = buildService();

    await service.delete('folder/id');

    expect(storageProvider.delete).toHaveBeenCalledWith('folder/id');
  });
});
