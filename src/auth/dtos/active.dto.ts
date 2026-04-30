import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ActiveDto {
  @ApiProperty({
    example: 'abc123verificationtoken',
    description: 'Email verification token',
  })
  @IsString()
  token: string;
}
