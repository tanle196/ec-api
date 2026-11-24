import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerLinkType } from '../enums/banner-link-type.enum';
import { BannerPosition } from '../enums/banner-position.enum';

export class BannerResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  subtitle!: string | null;
  @ApiProperty({ enum: BannerPosition }) position!: BannerPosition;
  @ApiProperty() imageUrl!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageMobileUrl!: string | null;
  @ApiProperty({ enum: BannerLinkType }) linkType!: BannerLinkType;
  @ApiPropertyOptional({ type: String, nullable: true })
  linkValue!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true })
  startsAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  endsAt!: Date | null;
  @ApiProperty() clickCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
