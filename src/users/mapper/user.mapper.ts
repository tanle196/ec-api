import { UserResponseDto } from '../dto/user-response.dto';
import { User } from '../entities/user.entity';

export class UserMapper {
  static toResponse = (entity: User): UserResponseDto => {
    return {
      id: entity.id,
      email: entity.email,
      fullName: entity.fullName,
      createdAt: entity.createdAt,
    };
  };

  static toResponseList(entities: User[]): UserResponseDto[] {
    return entities.map(this.toResponse);
  }
}
