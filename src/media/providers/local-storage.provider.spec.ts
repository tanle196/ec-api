import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalStorageProvider } from './local-storage.provider';

describe('LocalStorageProvider', () => {
  let uploadPath: string;
  let provider: LocalStorageProvider;

  const file = {
    originalname: 'photo.png',
    size: 3,
    buffer: Buffer.from('abc'),
  } as Express.Multer.File;

  beforeEach(() => {
    uploadPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-api-media-'));
    const config = {
      getMediaConfig: () => ({
        local: { uploadPath, publicUrl: 'http://localhost/uploads' },
      }),
    };
    provider = new LocalStorageProvider(config as never);
    jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(provider['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fs.rmSync(uploadPath, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('writes the file into a (created) folder and returns its public URL', async () => {
    const result = await provider.upload(file, 'banners');

    expect(result.publicId).toMatch(/^banners\/[0-9a-f-]{36}$/);
    expect(result.url).toBe(`http://localhost/uploads/${result.publicId}.png`);
    expect(result.bytes).toBe(3);
    expect(result.originalName).toBe('photo.png');
    expect(
      fs.readFileSync(path.join(uploadPath, `${result.publicId}.png`), 'utf8'),
    ).toBe('abc');
  });

  it('writes to the root upload path without a folder', async () => {
    const result = await provider.upload(file);

    expect(result.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.existsSync(path.join(uploadPath, `${result.publicId}.png`))).toBe(
      true,
    );
  });

  it('throws InternalServerErrorException when writing fails', () => {
    // Point uploadPath at a regular file so writing "inside" it fails.
    const notADir = path.join(uploadPath, 'not-a-dir');
    fs.writeFileSync(notADir, '');
    const broken = new LocalStorageProvider({
      getMediaConfig: () => ({
        local: { uploadPath: notADir, publicUrl: 'http://x' },
      }),
    } as never);
    jest.spyOn(broken['logger'], 'error').mockImplementation(() => undefined);

    // upload() is not async, so the error is thrown synchronously.
    expect(() => broken.upload(file)).toThrow(InternalServerErrorException);
  });

  it('deletes the stored file by publicId', async () => {
    const { publicId } = await provider.upload(file, 'banners');

    await provider.delete(publicId);

    expect(fs.readdirSync(path.join(uploadPath, 'banners'))).toEqual([]);
  });

  it('skips deletion when the folder does not exist', async () => {
    await expect(provider.delete('missing/abc')).resolves.toBeUndefined();
    expect(jest.spyOn(provider['logger'], 'warn')).toHaveBeenCalled();
  });
});
