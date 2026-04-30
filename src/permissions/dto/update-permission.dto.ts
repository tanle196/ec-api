// permissions/dto/update-permission.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({
    example: 'Xem & tìm kiếm người dùng',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
