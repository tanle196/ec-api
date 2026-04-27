import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  full_name!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Nguyen Trai, HCM' })
  @IsOptional()
  address?: string;
}
