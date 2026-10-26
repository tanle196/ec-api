import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({
    example: 'e4b5f7a0-1c2d-4e3f-8a9b-0c1d2e3f4a5b',
    description: 'ID người dùng',
  })
  id!: string;

  @ApiProperty({
    example: 'Name',
    description: 'Tên người dùng',
  })
  name!: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email người dùng',
  })
  email!: string;

  @ApiProperty({
    example: ['ADMIN', 'USER'],
    description: 'Danh sách role của người dùng',
    type: [String],
  })
  roles!: string[];

  @ApiProperty({
    example: ['user.read', 'user.create', 'post.update'],
    description: 'Danh sách permission của người dùng',
    type: [String],
  })
  permissions!: string[];
}
