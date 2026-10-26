import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { TypedConfigService } from '@/config/TypedConfigService';
import { IStorageProvider, UploadResult } from './storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);

  constructor(private readonly config: TypedConfigService) {}

  upload(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    const { uploadPath, publicUrl } = this.config.getMediaConfig().local;
    const targetFolder = folder ? path.join(uploadPath, folder) : uploadPath;

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const ext = path.extname(file.originalname);
    const publicId = folder ? `${folder}/${randomUUID()}` : randomUUID();
    const filename = `${path.basename(publicId)}${ext}`;
    const filePath = path.join(targetFolder, filename);

    try {
      fs.writeFileSync(filePath, file.buffer);
    } catch (err) {
      this.logger.error('Failed to write file to disk', err);
      throw new InternalServerErrorException('Failed to save image to disk');
    }

    const relPath = folder ? `${folder}/${filename}` : filename;
    return Promise.resolve({
      url: `${publicUrl}/${relPath}`,
      publicId,
      bytes: file.size,
      originalName: file.originalname,
    });
  }

  delete(publicId: string): Promise<void> {
    const { uploadPath } = this.config.getMediaConfig().local;
    const root = path.resolve(uploadPath);
    // publicId format: "folder/uuid" or "uuid"; the stored file is "<uuid><ext>"
    const dir = path.resolve(root, path.dirname(publicId));
    const base = path.basename(publicId);

    // publicId comes from the request path, so it must not be able to point
    // outside the upload directory (e.g. "../../etc/x") or match every file
    // in a folder (an empty/"."/".." basename).
    if (
      (dir !== root && !dir.startsWith(root + path.sep)) ||
      !base ||
      base === '.' ||
      base === '..'
    ) {
      return Promise.reject(new BadRequestException('Invalid publicId'));
    }

    if (fs.existsSync(dir)) {
      // Exact match on "<base>" or "<base>.<ext>" — a plain prefix match
      // would also delete unrelated files that merely start with `base`.
      const files = fs
        .readdirSync(dir)
        .filter((f) => f === base || f.startsWith(`${base}.`));
      for (const f of files) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch (err) {
          this.logger.error(`Failed to delete local file: ${f}`, err);
        }
      }
    } else {
      this.logger.warn(`Delete skipped — directory not found: ${dir}`);
    }

    return Promise.resolve();
  }
}
