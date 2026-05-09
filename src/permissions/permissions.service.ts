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
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { PermissionListQueryDto } from './dto/permission-list-query.dto';
import { PermissionResponseDto } from './dto/permission-response.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const existed = await this.permissionRepo.findOne({
      where: { module: dto.module, action: dto.action },
    });
    if (existed) {
      throw new ConflictException('Permission already exists');
    }

    const permission = this.permissionRepo.create({
      module: dto.module,
      action: dto.action,
      description: dto.description,
      isSystem: dto.isSystem ?? false,
    });

    return this.permissionRepo.save(permission);
  }

  async findAll(
    query: PermissionListQueryDto,
  ): Promise<PaginatedResponseDto<PermissionResponseDto>> {
    const { page = 1, limit = 20, module, action } = query;
    const where: Record<string, unknown> = {};
    if (module) where.module = module;
    if (action) where.action = action;

    const [data, total] = await this.permissionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    return permission;
  }

  async update(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id);

    if (permission.isSystem) {
      throw new ForbiddenException('Cannot modify a system permission');
    }

    permission.description = dto.description ?? permission.description;
    return this.permissionRepo.save(permission);
  }

  async remove(id: string): Promise<{ message: string }> {
    const permission = await this.findOne(id);

    if (permission.isSystem) {
      throw new ForbiddenException('Cannot delete a system permission');
    }

    await this.permissionRepo.remove(permission);
    return { message: 'Permission deleted' };
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
