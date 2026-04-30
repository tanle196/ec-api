import { ApiProperty } from '@nestjs/swagger';

export class PermissionResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Permission unique identifier',
  })
  id!: string;

  @ApiProperty({
    example: 'Read users permission',
    description: 'Permission description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Permission creation date',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Permission last update date',
  })
  updatedAt!: Date;
}
