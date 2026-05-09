import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { PermissionAction } from '../enums/permission-action.enum';

export class PermissionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'user' })
  module!: string;

  @ApiProperty({ example: PermissionAction.READ, enum: PermissionAction })
  action!: PermissionAction;

  @ApiProperty({ example: 'Read users permission' })
  description!: string;

  @ApiProperty({ example: false })
  isSystem!: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

export class PermissionPaginatedResponseDto extends PaginatedResponseDto<PermissionResponseDto> {
  @ApiProperty({ type: () => [PermissionResponseDto] })
  data: PermissionResponseDto[] = [];
}
