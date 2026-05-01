import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PermissionAction } from '../enums/permission-action.enum';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'user',
    description: 'Module',
  })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiProperty({
    enum: PermissionAction,
    example: PermissionAction.READ,
  })
  @IsEnum(PermissionAction)
  action!: PermissionAction;

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
  @IsBoolean()
  isSystem?: boolean;
}
