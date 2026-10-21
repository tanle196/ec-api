import { BannerResponseDto } from '../dto/banner-response.dto';
import { Banner } from '../entities/banner.entity';

export class BannerMapper {
  // imagePublicId / imageMobilePublicId are storage-provider internals and
  // are intentionally not exposed.
  static toResponse = (entity: Banner): BannerResponseDto => ({
    id: entity.id,
    title: entity.title,
    subtitle: entity.subtitle,
    position: entity.position,
    imageUrl: entity.imageUrl,
    imageMobileUrl: entity.imageMobileUrl,
    linkType: entity.linkType,
    linkValue: entity.linkValue,
    sortOrder: entity.sortOrder,
    isActive: entity.isActive,
    startsAt: entity.startsAt,
    endsAt: entity.endsAt,
    clickCount: entity.clickCount,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Banner[]): BannerResponseDto[] =>
    entities.map(BannerMapper.toResponse);
}
