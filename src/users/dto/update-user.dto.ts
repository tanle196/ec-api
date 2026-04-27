import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsIn } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import type { UserRole } from '../entities/user.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ enum: ['customer', 'admin', 'staff'] })
  @IsOptional()
  @IsIn(['customer', 'admin', 'staff'])
  role?: UserRole;
}
