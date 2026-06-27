import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { RoleResponseDto } from '@/roles/dto/role-response.dto';
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'c1a2b3',
    description: 'User ID',
  })
  id!: string;

  @ApiProperty({ example: 'USR-20260627-AB12CD' })
  userCode!: string;

  @ApiProperty({
    example: 'user@gmail.com',
  })
  email!: string;

  @ApiProperty({
    example: 'Tan Nguyen',
  })
  fullName!: string;

  @ApiProperty({
    example: [{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'admin' }],
    description: 'Roles to assign to the user',
    type: [RoleResponseDto],
  })
  roles!: RoleResponseDto[];

  @ApiProperty({
    example: '2026-05-03T10:00:00Z',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-05-03T10:00:00Z',
  })
  updatedAt!: Date;
}

export class UserPaginatedResponseDto extends PaginatedResponseDto<UserResponseDto> {
  // Thêm từ khóa declare để báo cho TS biết đây chỉ là khai báo đè kiểu, không sinh code JS
  @ApiProperty({ type: () => [UserResponseDto] })
  data: UserResponseDto[] = [];
}
