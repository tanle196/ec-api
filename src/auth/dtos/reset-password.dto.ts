import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'abc123resettoken',
    description: 'Password reset token',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'Pass@123',
    description: 'New password',
  })
  @IsString()
  newPassword: string;
}
