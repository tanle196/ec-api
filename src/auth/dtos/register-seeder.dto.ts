import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@/roles/entities/role.entity';
import { RegisterDto } from './register.dto';

export class RegisterSeederDto extends RegisterDto {
  @ApiProperty({
    example: [{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'admin' }],
    description: 'Roles to assign to the user',
    type: [Role],
  })
  roles: Role[];
}
