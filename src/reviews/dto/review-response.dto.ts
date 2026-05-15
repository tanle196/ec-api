import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

export class ReviewAuthorDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) fullName!: string | null;
  @ApiPropertyOptional({ nullable: true }) avatar!: string | null;
}

export class ReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() user_id!: string;
  @ApiProperty({ type: ReviewAuthorDto }) user!: ReviewAuthorDto;
  @ApiProperty() product_id!: string;
  @ApiProperty() rating!: number;
  @ApiPropertyOptional({ nullable: true }) title!: string | null;
  @ApiPropertyOptional({ nullable: true }) content!: string | null;
  @ApiProperty() isVerified!: boolean;
  @ApiProperty() isApproved!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ReviewPaginatedResponseDto extends PaginatedResponseDto<ReviewResponseDto> {
  @ApiProperty({ type: [ReviewResponseDto] }) declare data: ReviewResponseDto[];
}
