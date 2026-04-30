import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    example: [
      '9d1c9c9e-8b7e-4f12-9f8b-123456789abc',
      '2c7e3d1a-1234-4b6c-9a11-abcdefabcdef',
    ],
    description: 'Danh sách permission ID',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
