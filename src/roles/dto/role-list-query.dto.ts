import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';

export class RoleFilterDto {
  @ApiPropertyOptional({ description: 'Filter by role name' })
  name?: string;
}

export class RoleListQueryDto extends IntersectionType(
  PaginationDto,
  RoleFilterDto,
) {}
