import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({
    example: ['9d1c9c9e-8b7e-4f12-9f8b-123456789abc'],
    description: 'Danh sách role ID',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
