import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '@/permissions/entities/permission.entity';
import { Role } from '@/roles/entities/role.entity';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { User } from './entities/user.entity';
import { UserDetailDto } from './dto/user-detail.dto';
import { UserMapper } from './mapper/user.mapper';
import { UserPaginatedResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';

type SafeUserUpdate = Pick<User, 'fullName' | 'avatar'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email },
      relations: ['identities'],
    });
  }

  async findByIdWithRelations(id: string): Promise<UserDetailDto> {
    const user = await this.repo.findOne({
      where: { id },
      relations: ['roles', 'permissions'],
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      userCode: user.userCode ?? '',
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findByUserCode(userCode: string): Promise<UserDetailDto> {
    const user = await this.repo.findOne({
      where: { userCode },
      relations: ['roles', 'permissions'],
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      userCode: user.userCode ?? '',
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar,
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async update(
    id: string,
    data: Partial<SafeUserUpdate>,
  ): Promise<User | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    await this.repo.remove(user);
  }

  async assignRoles(userId: string, roleIds: string[]): Promise<UserDetailDto> {
    const user = await this.repo.findOne({
      where: { id: userId },
      relations: ['roles', 'permissions'],
    });
    if (!user) throw new NotFoundException('User not found');

    user.roles = roleIds.length
      ? await this.roleRepo.findBy({ id: In(roleIds) })
      : [];

    await this.repo.save(user);
    return this.findByIdWithRelations(userId);
  }

  async assignPermissions(
    userId: string,
    permissionIds: string[],
  ): Promise<UserDetailDto> {
    const user = await this.repo.findOne({
      where: { id: userId },
      relations: ['roles', 'permissions'],
    });
    if (!user) throw new NotFoundException('User not found');

    user.permissions = permissionIds.length
      ? await this.permissionRepo.findBy({ id: In(permissionIds) })
      : [];

    await this.repo.save(user);
    return this.findByIdWithRelations(userId);
  }

  async getUserProfile(id: string): Promise<UserProfileDto | null> {
    const user = await this.repo.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });

    if (!user) return null;

    const roleNames = user.roles?.map((r) => r.name) ?? [];

    const rolePermissions =
      user.roles
        ?.flatMap((r) => r.permissions?.map((p) => `${p.module}.${p.action}`))
        .filter((p): p is string => Boolean(p)) ?? [];

    const userPermissions =
      user.permissions
        ?.map((p) => `${p.module}.${p.action}`)
        .filter((p): p is string => Boolean(p)) ?? [];

    const allPermissions = Array.from(
      new Set([...rolePermissions, ...userPermissions]),
    );

    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      roles: roleNames,
      permissions: allPermissions,
    };
  }

  async findAll(query: UserListQueryDto): Promise<UserPaginatedResponseDto> {
    const { page = 1, limit = 20, email, userCode } = query;

    const qb = this.repo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.userCode',
        'u.email',
        'u.fullName',
        'u.avatar',
        'u.createdAt',
        'u.updatedAt',
      ])
      .leftJoinAndSelect('u.roles', 'roles')
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (email) qb.andWhere('u.email ILIKE :email', { email: `%${email}%` });
    if (userCode) qb.andWhere('u.userCode = :userCode', { userCode });

    const [users, total] = await qb.getManyAndCount();

    return {
      data: users.map(UserMapper.toResponse),
      total,
      page,
      limit,
    };
  }
}
