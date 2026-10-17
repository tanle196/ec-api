import { InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import { CloudinaryProvider } from './cloudinary.provider';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload_stream: jest.fn(), destroy: jest.fn() },
  },
}));

type UploadCallback = (error?: { message: string }, result?: object) => void;

describe('CloudinaryProvider', () => {
  const config = {
    getMediaConfig: () => ({
      cloudinary: {
        cloudName: 'cloud',
        apiKey: 'key',
        apiSecret: 'secret',
        folder: 'ec-api',
      },
    }),
  };
  const file = {
    originalname: 'photo.png',
    buffer: Buffer.from('abc'),
  } as Express.Multer.File;

  const uploadStream = cloudinary.uploader.upload_stream as jest.Mock;
  const destroy = cloudinary.uploader.destroy as jest.Mock;

  const mockUpload = (error?: { message: string }, result?: object) => {
    uploadStream.mockImplementation((_opts: object, cb: UploadCallback) => {
      const chunks: Buffer[] = [];
      return new Writable({
        write(chunk: Buffer, _enc, next) {
          chunks.push(chunk);
          next();
        },
        final(done) {
          cb(error, result);
          done();
        },
      });
    });
  };

  let provider: CloudinaryProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new CloudinaryProvider(config as never);
    jest.spyOn(provider['logger'], 'error').mockImplementation(() => undefined);
  });

  it('configures the SDK with credentials', () => {
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'cloud',
      api_key: 'key',
      api_secret: 'secret',
    });
  });

  it('uploads to the default folder and maps the response', async () => {
    mockUpload(undefined, {
      secure_url: 'https://res/x.png',
      public_id: 'ec-api/x',
      width: 10,
      height: 20,
      format: 'png',
      bytes: 3,
    });

    await expect(provider.upload(file)).resolves.toEqual({
      url: 'https://res/x.png',
      publicId: 'ec-api/x',
      width: 10,
      height: 20,
      format: 'png',
      bytes: 3,
      originalName: 'photo.png',
    });
    expect(uploadStream).toHaveBeenCalledWith(
      {
        folder: 'ec-api',
        resource_type: 'image',
        use_filename: false,
        unique_filename: true,
      },
      expect.any(Function),
    );
  });

  it('uploads to an explicit folder', async () => {
    mockUpload(undefined, { secure_url: 'u', public_id: 'p' });

    await provider.upload(file, 'banners');

    expect((uploadStream.mock.calls as unknown[][])[0][0]).toEqual(
      expect.objectContaining({ folder: 'banners' }),
    );
  });

  it('wraps upload errors', async () => {
    mockUpload({ message: 'quota exceeded' });

    await expect(provider.upload(file)).rejects.toThrow(
      new InternalServerErrorException('quota exceeded'),
    );
  });

  it('deletes by publicId', async () => {
    destroy.mockResolvedValue({ result: 'ok' });

    await provider.delete('ec-api/x');

    expect(destroy).toHaveBeenCalledWith('ec-api/x');
  });

  it('wraps delete errors', async () => {
    destroy.mockRejectedValue(new Error('network'));

    await expect(provider.delete('ec-api/x')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
