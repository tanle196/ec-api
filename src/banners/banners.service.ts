import { MediaService } from '@/media/media.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBannerDto } from './dto/create-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { Banner } from './entities/banner.entity';
import { BannerPosition } from './enums/banner-position.enum';

@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(Banner)
    private readonly bannerRepo: Repository<Banner>,
    private readonly mediaService: MediaService,
  ) {}

  async create(dto: CreateBannerDto): Promise<Banner> {
    const banner = this.bannerRepo.create({
      ...dto,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.bannerRepo.save(banner);
  }

  async findActive(position?: BannerPosition): Promise<Banner[]> {
    const now = new Date();

    const qb = this.bannerRepo
      .createQueryBuilder('b')
      .where('b.isActive = :active', { active: true })
      .andWhere('(b.startsAt IS NULL OR b.startsAt <= :now)', { now })
      .andWhere('(b.endsAt IS NULL OR b.endsAt >= :now)', { now })
      .orderBy('b.sortOrder', 'ASC')
      .addOrderBy('b.createdAt', 'DESC');

    if (position) {
      qb.andWhere('b.position = :position', { position });
    }

    return qb.getMany();
  }

  async findAll(position?: BannerPosition): Promise<Banner[]> {
    return this.bannerRepo.find({
      where: position ? { position } : undefined,
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Banner> {
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto): Promise<Banner> {
    const banner = await this.findOne(id);
    Object.assign(banner, dto);
    return this.bannerRepo.save(banner);
  }

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    isMobile: boolean,
  ): Promise<Banner> {
    const banner = await this.findOne(id);

    const oldPublicId = isMobile
      ? banner.imageMobilePublicId
      : banner.imagePublicId;

    if (oldPublicId) {
      await this.mediaService.delete(oldPublicId).catch(() => null);
    }

    const result = await this.mediaService.uploadOne(file, 'banners');

    if (isMobile) {
      banner.imageMobileUrl = result.url;
      banner.imageMobilePublicId = result.publicId ?? null;
    } else {
      banner.imageUrl = result.url;
      banner.imagePublicId = result.publicId ?? null;
    }

    return this.bannerRepo.save(banner);
  }

  async incrementClickCount(id: string): Promise<void> {
    await this.bannerRepo.increment({ id }, 'clickCount', 1);
  }

  async reorder(dto: ReorderBannersDto): Promise<void> {
    await Promise.all(
      dto.items.map(({ id, sortOrder }) =>
        this.bannerRepo.update(id, { sortOrder }),
      ),
    );
  }

  async remove(id: string): Promise<void> {
    const banner = await this.findOne(id);

    const cleanups: Promise<void>[] = [];
    if (banner.imagePublicId) {
      cleanups.push(
        this.mediaService
          .delete(banner.imagePublicId)
          .catch(() => null) as Promise<void>,
      );
    }
    if (banner.imageMobilePublicId) {
      cleanups.push(
        this.mediaService
          .delete(banner.imageMobilePublicId)
          .catch(() => null) as Promise<void>,
      );
    }
    await Promise.all(cleanups);

    await this.bannerRepo.remove(banner);
  }
}
