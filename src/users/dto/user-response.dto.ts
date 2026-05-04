import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: 'c1a2b3',
    description: 'User ID',
  })
  id!: string;

  @ApiProperty({
    example: 'user@gmail.com',
  })
  email!: string;

  @ApiProperty({
    example: 'Tan Nguyen',
  })
  fullName!: string;

  @ApiProperty({
    example: '2026-05-03T10:00:00Z',
  })
  createdAt!: Date;
}

export class UserPaginatedResponseDto extends PaginatedResponseDto<UserResponseDto> {
  // Thêm từ khóa declare để báo cho TS biết đây chỉ là khai báo đè kiểu, không sinh code JS
  @ApiProperty({ type: () => [UserResponseDto] })
  data: UserResponseDto[] = [];
}
