import { ApiProperty } from '@nestjs/swagger';
import { PermissionResponseDto } from '@/permissions/dto/permission-response.dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

export class RoleResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Role unique identifier',
  })
  id!: string;

  @ApiProperty({
    example: 'admin',
    description: 'Role name',
  })
  name!: string;

  @ApiProperty({
    example: 'Administrator role with full access',
    description: 'Role description',
    required: false,
  })
  description?: string;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Role creation date',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Role last update date',
  })
  updatedAt!: Date;

  @ApiProperty({
    type: [PermissionResponseDto],
    description: 'Permissions assigned to this role',
    required: false,
  })
  permissions?: PermissionResponseDto[];
}

export class RolePaginatedResponseDto extends PaginatedResponseDto<RoleResponseDto> {
  @ApiProperty({ type: () => [RoleResponseDto] })
  data: RoleResponseDto[] = [];
}
