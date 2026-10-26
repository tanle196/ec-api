import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({ example: 'editor', description: 'Role name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 'Editor role',
    description: 'Role description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
