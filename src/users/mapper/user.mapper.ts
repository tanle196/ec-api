import { RoleMapper } from '@/roles/mapper/role.mapper';
import { UserResponseDto } from '../dto/user-response.dto';
import { User } from '../entities/user.entity';

export class UserMapper {
  static toResponse = (entity: User): UserResponseDto => {
    return {
      id: entity.id,
      userCode: entity.userCode ?? '',
      email: entity.email,
      fullName: entity.fullName,
      roles: RoleMapper.toResponseList(entity.roles),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  };

  static toResponseList(entities: User[]): UserResponseDto[] {
    return entities.map(this.toResponse);
  }
}
