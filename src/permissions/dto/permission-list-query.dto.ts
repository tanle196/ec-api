import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PermissionAction } from '../enums/permission-action.enum';

export class PermissionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by module name' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({
    enum: PermissionAction,
    description: 'Filter by action',
  })
  @IsOptional()
  @IsEnum(PermissionAction)
  action?: PermissionAction;
}

export class PermissionListQueryDto extends IntersectionType(
  PaginationDto,
  PermissionFilterDto,
) {}
