import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'admin', description: 'Role name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Administrator role with full access',
    description: 'Role description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ],
    description: 'List of permission IDs for the role',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  permissions?: string[];
}
