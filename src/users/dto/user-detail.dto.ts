import { ApiProperty } from '@nestjs/swagger';
import { PermissionResponseDto } from '@/permissions/dto/permission-response.dto';
import { RoleResponseDto } from '@/roles/dto/role-response.dto';

export class UserDetailDto {
  @ApiProperty({ example: 'uuid-v4' })
  id!: string;

  @ApiProperty({ example: 'USR-20260627-AB12CD' })
  userCode!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Tan Nguyen', nullable: true })
  fullName!: string;

  @ApiProperty({ example: 'https://...', nullable: true })
  avatar!: string;

  @ApiProperty({ type: [RoleResponseDto] })
  roles!: RoleResponseDto[];

  @ApiProperty({
    type: [PermissionResponseDto],
    description: 'Direct permissions',
  })
  permissions!: PermissionResponseDto[];

  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  updatedAt!: Date;
}
