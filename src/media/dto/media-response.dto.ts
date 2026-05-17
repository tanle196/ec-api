import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadResultDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  url!: string;

  @ApiProperty({ example: 'ec-api/a1b2c3d4' })
  publicId!: string;

  @ApiPropertyOptional({ example: 1920 })
  width?: number;

  @ApiPropertyOptional({ example: 1080 })
  height?: number;

  @ApiPropertyOptional({ example: 'jpg' })
  format?: string;

  @ApiPropertyOptional({ example: 204800 })
  bytes?: number;

  @ApiProperty({ example: 'photo.jpg' })
  originalName!: string;
}

export class MultiUploadResultDto {
  @ApiProperty({ type: [UploadResultDto] })
  files!: UploadResultDto[];
}
