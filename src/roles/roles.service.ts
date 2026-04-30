import {
  ConflictException,
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
import { PaginationDto } from '@/common/dto/pagination.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async create(data: CreateRoleDto): Promise<Role> {
    const existing = await this.repo.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`Role '${data.name}' already exists`);
    }

    let permissions: Permission[] = [];
    if (data.permissions && data.permissions.length > 0) {
      permissions = await this.permissionRepo.find({
        where: { id: In(data.permissions) },
      });
    }

    const newRole = this.repo.create({
      name: data.name,
      description: data.description,
      permissions,
    });
    return this.repo.save(newRole);
  }

  async findAll(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [roles, total] = await this.repo.findAndCount({
      relations: ['permissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissionsCount: r.permissions?.length ?? 0,
        createdAt: r.createdAt,
      })),
      total,
    };
  }

  async findOne(id: string) {
    const role = await this.repo.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (role.name === 'ADMIN') {
      throw new ForbiddenException('Cannot modify the ADMIN role');
    }

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;

    return this.repo.save(role);
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    if (role.name === 'ADMIN') {
      throw new ForbiddenException('Cannot delete the ADMIN role');
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
