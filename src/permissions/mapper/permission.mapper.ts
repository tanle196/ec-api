import { PermissionResponseDto } from '../dto/permission-response.dto';
import { Permission } from '../entities/permission.entity';

export class PermissionMapper {
  static toResponse = (entity: Permission): PermissionResponseDto => ({
    id: entity.id,
    module: entity.module,
    action: entity.action,
    description: entity.description,
    isSystem: entity.isSystem,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Permission[]): PermissionResponseDto[] =>
    entities.map(PermissionMapper.toResponse);
}
