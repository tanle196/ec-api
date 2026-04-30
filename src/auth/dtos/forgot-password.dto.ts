import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'letutan500@gmail.com',
    description: 'Email address to send password reset link',
  })
  @IsEmail()
  email: string;
}
