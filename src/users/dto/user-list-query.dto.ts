import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';

export class UserFilterDto {
  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  role?: string;
}

export class UserListQueryDto extends IntersectionType(
  PaginationDto,
  UserFilterDto,
) {}
