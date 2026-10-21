import { BannerMapper } from './banner.mapper';

describe('BannerMapper', () => {
  it('drops the storage publicIds', () => {
    const createdAt = new Date('2026-01-01');
    const result = BannerMapper.toResponse({
      id: 'b-1',
      title: 'Sale',
      subtitle: null,
      position: 'hero',
      imageUrl: 'https://cdn/b.png',
      imageMobileUrl: null,
      imagePublicId: 'banners/b',
      imageMobilePublicId: 'banners/b-m',
      linkType: 'none',
      linkValue: null,
      sortOrder: 0,
      isActive: true,
      startsAt: null,
      endsAt: null,
      clickCount: 3,
      createdAt,
      updatedAt: createdAt,
    } as never);

    expect(result).not.toHaveProperty('imagePublicId');
    expect(result).not.toHaveProperty('imageMobilePublicId');
    expect(result).toMatchObject({ id: 'b-1', imageUrl: 'https://cdn/b.png' });
  });
});
