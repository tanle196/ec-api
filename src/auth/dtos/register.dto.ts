import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuthProvider } from '../enums/AuthProvider';

export class RegisterDto {
  @ApiProperty({
    example: 'letutan500@gmail.com',
    description: 'User email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '12345678',
    description: 'User password',
    minLength: 8,
    maxLength: 50,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  password: string;

  @ApiProperty({
    example: AuthProvider.LOCAL,
    enum: AuthProvider,
    description: 'Authentication provider',
  })
  @IsEnum(AuthProvider)
  provider: AuthProvider;
}
