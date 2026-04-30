import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PermissionAction } from '../enums/permission-action.enum';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'user',
    description: 'Module',
  })
  module: string;

  @ApiProperty({
    enum: PermissionAction,
    example: PermissionAction.READ,
  })
  action: PermissionAction;

  @ApiProperty({
    example: 'Xem danh sách người dùng',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: false,
    required: false,
    description: 'Đánh dấu permission hệ thống',
  })
  @IsOptional()
  isSystem?: boolean;
}
