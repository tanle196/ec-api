import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BannerLinkType } from '../enums/banner-link-type.enum';
import { BannerPosition } from '../enums/banner-position.enum';

export class CreateBannerDto {
  @ApiProperty({ example: 'Flash Sale 6.6' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'Giảm đến 50% toàn bộ sản phẩm' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({ enum: BannerPosition, example: BannerPosition.HERO })
  @IsEnum(BannerPosition)
  position!: BannerPosition;

  @ApiProperty({ example: 'https://cdn.example.com/banner.jpg' })
  @IsString()
  @IsNotEmpty()
  imageUrl!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/banner-mobile.jpg' })
  @IsString()
  @IsOptional()
  imageMobileUrl?: string;

  @ApiPropertyOptional({ example: 'banners/flash-sale-6-6' })
  @IsString()
  @IsOptional()
  imagePublicId?: string;

  @ApiPropertyOptional({ example: 'banners/flash-sale-6-6-mobile' })
  @IsString()
  @IsOptional()
  imageMobilePublicId?: string;

  @ApiProperty({ enum: BannerLinkType, example: BannerLinkType.URL })
  @IsEnum(BannerLinkType)
  linkType!: BannerLinkType;

  @ApiPropertyOptional({ example: '/products?tag=sale' })
  @IsString()
  @IsOptional()
  linkValue?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-06-06T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startsAt?: Date;

  @ApiPropertyOptional({ example: '2026-06-07T23:59:59Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endsAt?: Date;
}
