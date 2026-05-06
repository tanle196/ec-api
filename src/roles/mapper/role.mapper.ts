import { RoleResponseDto } from '../dto/role-response.dto';
import { Role } from '../entities/role.entity';

export class RoleMapper {
  static toResponse = (entity: Role): RoleResponseDto => {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  };

  static toResponseList(entities: Role[]): RoleResponseDto[] {
    return entities.map(this.toResponse);
  }
}
