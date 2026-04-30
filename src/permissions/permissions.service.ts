// permissions/permissions.service.ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  /**
   * CREATE permission
   */
  async create(dto: CreatePermissionDto): Promise<Permission> {
    const existed = await this.permissionRepo.findOne({
      where: {
        module: dto.module,
        action: dto.action,
      },
    });
    if (existed) {
      throw new ConflictException('Permission đã tồn tại');
    }

    const permission = this.permissionRepo.create({
      module: dto.module,
      action: dto.action,
      description: dto.description,
      isSystem: dto.isSystem ?? false,
    });

    return this.permissionRepo.save(permission);
  }

  /**
   * GET all permissions
   */
  async findAll(): Promise<Permission[]> {
    return this.permissionRepo.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  /**
   * GET permission by id
   */
  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException('Permission không tồn tại');
    }

    return permission;
  }

  /**
   * UPDATE permission (chỉ cho sửa description)
   */
  async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id);

    if (permission.isSystem) {
      throw new ForbiddenException('Không thể chỉnh sửa permission hệ thống');
    }

    permission.description = dto.description ?? permission.description;

    return this.permissionRepo.save(permission);
  }

  /**
   * DELETE permission
   * ⚠️ Không cho xóa permission hệ thống
   * ⚠️ Có thể đổi sang soft delete nếu muốn
   */
  async remove(id: string): Promise<{ message: string }> {
    const permission = await this.findOne(id);

    if (permission.isSystem) {
      throw new ForbiddenException('Không thể xóa permission hệ thống');
    }

    await this.permissionRepo.remove(permission);

    return {
      message: 'Permission đã được xóa',
    };
  }

  async getMeta() {
    const permissions = await this.permissionRepo.find({
      select: ['module', 'action', 'isSystem'],
    });

    const modules = Array.from(new Set(permissions.map((p) => p.module)));

    const systemActions = Array.from(
      new Set(permissions.filter((p) => p.isSystem).map((p) => p.action)),
    );

    const customActions = Array.from(
      new Set(permissions.filter((p) => !p.isSystem).map((p) => p.action)),
    );

    return {
      modules: modules.sort(),
      systemActions: systemActions.sort(),
      customActions: customActions.sort(),
    };
  }
}
