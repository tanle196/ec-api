import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TypedConfigService } from '@/config/TypedConfigService';
import type {
  IStorageProvider,
  UploadResult,
} from './providers/storage-provider.interface';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';

@Injectable()
export class MediaService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: IStorageProvider,
    private readonly config: TypedConfigService,
  ) {}

  async uploadOne(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult> {
    this.validateFile(file);
    return this.storageProvider.upload(file, folder);
  }

  async uploadMany(
    files: Express.Multer.File[],
    folder?: string,
  ): Promise<UploadResult[]> {
    files.forEach((f) => this.validateFile(f));
    return Promise.all(
      files.map((f) => this.storageProvider.upload(f, folder)),
    );
  }

  async delete(publicId: string): Promise<void> {
    return this.storageProvider.delete(publicId);
  }

  private validateFile(file: Express.Multer.File): void {
    const { maxFileSizeBytes, allowedMimeTypes } = this.config.getMediaConfig();
    if (file.size > maxFileSizeBytes) {
      throw new BadRequestException(
        `File "${file.originalname}" exceeds the maximum allowed size of ${maxFileSizeBytes / 1024 / 1024}MB`,
      );
    }
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }
  }
}
