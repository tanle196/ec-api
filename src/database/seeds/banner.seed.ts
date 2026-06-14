import { DataSource } from 'typeorm';
import { Banner } from '@/banners/entities/banner.entity';
import { BannerLinkType } from '@/banners/enums/banner-link-type.enum';
import { BannerPosition } from '@/banners/enums/banner-position.enum';

const BANNERS: Partial<Banner>[] = [
  {
    title: 'Flash Sale Hè 2026',
    subtitle: 'Giảm đến 50% toàn bộ sản phẩm',
    position: BannerPosition.HERO,
    imageUrl:
      'https://placehold.co/1440x560/FF6B35/FFFFFF?text=Flash+Sale+He+2026',
    imageMobileUrl:
      'https://placehold.co/768x400/FF6B35/FFFFFF?text=Flash+Sale+He+2026',
    linkType: BannerLinkType.URL,
    linkValue: '/products?tag=sale',
    sortOrder: 0,
    isActive: true,
  },
  {
    title: 'Bộ sưu tập mới nhất',
    subtitle: 'Khám phá xu hướng mùa hè',
    position: BannerPosition.HERO,
    imageUrl: 'https://placehold.co/1440x560/4A90D9/FFFFFF?text=Bo+Suu+Tap+Moi',
    imageMobileUrl:
      'https://placehold.co/768x400/4A90D9/FFFFFF?text=Bo+Suu+Tap+Moi',
    linkType: BannerLinkType.URL,
    linkValue: '/products?sort=newest',
    sortOrder: 1,
    isActive: true,
  },
  {
    title: 'Miễn phí vận chuyển cho đơn từ 300k',
    subtitle: null,
    position: BannerPosition.PROMO_STRIP,
    imageUrl:
      'https://placehold.co/1440x48/2ECC71/FFFFFF?text=Mien+phi+van+chuyen+don+tu+300k',
    linkType: BannerLinkType.URL,
    linkValue: null,
    sortOrder: 0,
    isActive: true,
  },
  {
    title: 'Phụ kiện thời trang',
    subtitle: 'Giảm 30%',
    position: BannerPosition.MID_PAGE,
    imageUrl:
      'https://placehold.co/600x300/9B59B6/FFFFFF?text=Phu+kien+thoi+trang',
    linkType: BannerLinkType.URL,
    linkValue: '/categories/accessories',
    sortOrder: 0,
    isActive: true,
  },
  {
    title: 'Ưu đãi đặc biệt',
    subtitle: 'Nhập mã HELLO10 giảm thêm 10%',
    position: BannerPosition.POPUP,
    imageUrl: 'https://placehold.co/600x400/E74C3C/FFFFFF?text=Uu+dai+dac+biet',
    linkType: BannerLinkType.DISCOUNT,
    linkValue: 'HELLO10',
    sortOrder: 0,
    isActive: false,
  },
];

export async function seedBanners(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Banner);

  for (const data of BANNERS) {
    const exists = await repo.findOne({
      where: { title: data.title, position: data.position },
    });
    if (!exists) {
      await repo.save(repo.create(data));
      console.log(`  [+] Banner: [${data.position}] ${data.title}`);
    } else {
      console.log(`  [~] Banner exists: [${data.position}] ${data.title}`);
    }
  }
}
