import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

export enum StorageProvider {
  Cloudinary = 'cloudinary',
  Local = 'local',
}

const mediaConfig = registerAs(ConfigModules.Media, () => ({
  provider:
    (process.env.STORAGE_PROVIDER as StorageProvider) ?? StorageProvider.Local,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER ?? 'ec-api',
  },
  local: {
    uploadPath: process.env.LOCAL_UPLOAD_PATH ?? './uploads',
    publicUrl: process.env.LOCAL_PUBLIC_URL ?? 'http://localhost:3000/uploads',
  },
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES ?? '5242880', 10), // 5MB
  allowedMimeTypes: (
    process.env.ALLOWED_MIME_TYPES ??
    'image/jpeg,image/png,image/webp,image/gif'
  ).split(','),
}));

export type MediaConfig = ConfigType<typeof mediaConfig>;
export default mediaConfig;
