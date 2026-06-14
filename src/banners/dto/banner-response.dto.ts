import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerLinkType } from '../enums/banner-link-type.enum';
import { BannerPosition } from '../enums/banner-position.enum';

export class BannerResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() subtitle!: string | null;
  @ApiProperty({ enum: BannerPosition }) position!: BannerPosition;
  @ApiProperty() imageUrl!: string;
  @ApiPropertyOptional() imageMobileUrl!: string | null;
  @ApiProperty({ enum: BannerLinkType }) linkType!: BannerLinkType;
  @ApiPropertyOptional() linkValue!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() startsAt!: Date | null;
  @ApiPropertyOptional() endsAt!: Date | null;
  @ApiProperty() clickCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
