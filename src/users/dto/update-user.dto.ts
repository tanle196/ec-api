// dto/update-user.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsBoolean, IsIn } from 'class-validator';
import type { UserRole } from '../entities/user.entity';

export class UpdateUserDto extends PartialType(CreateUserDto) {
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsOptional()
    role?: UserRole;
}