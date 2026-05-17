import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { TypedConfigService } from '@/config/TypedConfigService';
import { IStorageProvider, UploadResult } from './storage-provider.interface';

@Injectable()
export class CloudinaryProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudinaryProvider.name);

  constructor(private readonly config: TypedConfigService) {
    const { cloudName, apiKey, apiSecret } = config.getMediaConfig().cloudinary;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  async upload(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult> {
    const mediaConfig = this.config.getMediaConfig();
    const targetFolder = folder ?? mediaConfig.cloudinary.folder;

    const response = await this.uploadStream(file.buffer, {
      folder: targetFolder,
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
    });

    return {
      url: response.secure_url,
      publicId: response.public_id,
      width: response.width,
      height: response.height,
      format: response.format,
      bytes: response.bytes,
      originalName: file.originalname,
    };
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      this.logger.error(`Failed to delete Cloudinary asset: ${publicId}`, err);
      throw new InternalServerErrorException(
        'Failed to delete image from Cloudinary',
      );
    }
  }

  private uploadStream(
    buffer: Buffer,
    options: Record<string, unknown>,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error)
            return reject(new InternalServerErrorException(error.message));
          resolve(result!);
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(stream);
    });
  }
}
