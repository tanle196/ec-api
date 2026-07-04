import { Column, Entity } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { BannerLinkType } from '../enums/banner-link-type.enum';
import { BannerPosition } from '../enums/banner-position.enum';

@Entity('banners')
export class Banner extends AbstractBaseEntity {
  @Column()
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  subtitle!: string | null;

  @Column({ type: 'enum', enum: BannerPosition, default: BannerPosition.HERO })
  position!: BannerPosition;

  @Column({ type: 'varchar' })
  imageUrl!: string;

  @Column({ type: 'varchar', nullable: true })
  imageMobileUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  imagePublicId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageMobilePublicId!: string | null;

  @Column({
    type: 'enum',
    enum: BannerLinkType,
    default: BannerLinkType.URL,
  })
  linkType!: BannerLinkType;

  @Column({ type: 'varchar', nullable: true })
  linkValue!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endsAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  clickCount!: number;
}
