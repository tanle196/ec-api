import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { User } from './entities/user.entity';
import { UserMapper } from './mapper/user.mapper';
import { UserPaginatedResponseDto } from './dto/user-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';

type SafeUserUpdate = Pick<User, 'fullName' | 'avatar'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
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

  async update(
    id: string,
    data: Partial<SafeUserUpdate>,
  ): Promise<User | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async delete(id: string | number): Promise<void> {
    await this.repo.delete(id);
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
      name: user.fullName,
      email: user.email,
      roles: roleNames,
      permissions: allPermissions,
    };
  }

  async findAll(query: UserListQueryDto): Promise<UserPaginatedResponseDto> {
    const { page = 1, limit = 20 } = query;
    const [users, total] = await this.repo.findAndCount({
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
      relations: {
        roles: true, // ✅ Join bảng roles
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: users.map(UserMapper.toResponse),
      total,
      page,
      limit,
    };
  }
}
