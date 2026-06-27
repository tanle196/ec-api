import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';

export class UserFilterDto {
  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  role?: string;

  @ApiPropertyOptional({ example: 'USR-20260627-AB12CD' })
  userCode?: string;
}

export class UserListQueryDto extends IntersectionType(
  PaginationDto,
  UserFilterDto,
) {}
