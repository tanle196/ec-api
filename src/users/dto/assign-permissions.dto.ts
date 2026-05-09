import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignUserPermissionsDto {
  @ApiProperty({
    example: ['9d1c9c9e-8b7e-4f12-9f8b-123456789abc'],
    description: 'Danh sách permission ID gán trực tiếp cho user',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
