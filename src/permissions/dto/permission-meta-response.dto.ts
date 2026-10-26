import { ApiProperty } from '@nestjs/swagger';

export class PermissionMetaResponseDto {
  @ApiProperty({
    example: ['user', 'product', 'order'],
    description: 'Danh sách module hiện có',
  })
  modules: string[];

  @ApiProperty({
    example: ['read', 'create', 'update', 'delete'],
    description: 'Danh sách action hệ thống (CRUD)',
  })
  systemActions: string[];

  @ApiProperty({
    example: ['approve', 'refund'],
    description: 'Danh sách action custom (non-system)',
  })
  customActions: string[];
}
