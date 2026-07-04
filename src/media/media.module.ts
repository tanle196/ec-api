import { Module } from '@nestjs/common';
import { TypedConfigService } from '@/config/TypedConfigService';
import { StorageProvider } from '@/config/environment/media.config';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from './media.service';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';

@Module({
  controllers: [AdminMediaController],
  providers: [
    MediaService,
    CloudinaryProvider,
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [TypedConfigService, CloudinaryProvider, LocalStorageProvider],
      useFactory: (
        config: TypedConfigService,
        cloudinary: CloudinaryProvider,
        local: LocalStorageProvider,
      ) => {
        const provider = config.getMediaConfig().provider;
        return provider === StorageProvider.Cloudinary ? cloudinary : local;
      },
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
