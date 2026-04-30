import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permission } from '@/permissions/entities/permission.entity';
import { In, Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { Role } from './entities/role.entity';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async create(data: CreateRoleDto): Promise<Role> {
    const role = await this.repo.findOne({
      where: { name: data.name },
      relations: ['permissions'],
    });

    // Load permissions from database if provided
    let permissions: Permission[] = [];
    if (data.permissions && data.permissions.length > 0) {
      permissions = await this.permissionRepo.find({
        where: { id: In(data.permissions) },
      });
    }

    if (role) {
      // Update existing role with new permissions
      if (permissions.length > 0) {
        const existingPermissionIds = new Set(
          role.permissions.map((p) => p.id),
        );
        const newPermissions = permissions.filter(
          (p) => !existingPermissionIds.has(p.id),
        );
        role.permissions = [...role.permissions, ...newPermissions];
      }

      // Update description if provided
      if (data.description !== undefined) {
        role.description = data.description;
      }

      return this.repo.save(role);
    }

    // Create new role
    const newRole = this.repo.create({
      name: data.name,
      description: data.description,
      permissions,
    });
    return this.repo.save(newRole);
  }

  async findAll() {
    const roles = await this.repo.find({
      relations: ['permissions'],
      order: { createdAt: 'DESC' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissionsCount: r.permissions?.length ?? 0,
      createdAt: r.createdAt,
    }));
  }

  async findOne(id: string) {
    const role = await this.repo.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException('Role không tồn tại');
    }
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (role.name === 'ADMIN') {
      throw new ForbiddenException('Không thể sửa role ADMIN');
    }

    Object.assign(role, dto);
    return this.repo.save(role);
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    if (role.name === 'ADMIN') {
      throw new ForbiddenException('Không thể xoá role ADMIN');
    }

    await this.repo.remove(role);
    return { success: true };
  }

  async assignPermissions(roleId: string, permissionIds: string[]) {
    const role = await this.findOne(roleId);

    const permissions = await this.permissionRepo.findBy({
      id: In(permissionIds),
    });

    role.permissions = permissions;
    return this.repo.save(role);
  }
}
