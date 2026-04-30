import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

type SafeUserUpdate = Pick<User, 'fullName' | 'avatar'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) { }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email },
      relations: ['identities']
    })
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

  async getUserProfile(id: string): Promise<{
    email: User['email'];
    roles: string[];
    permissions: string[];
  } | null> {
    const user = await this.repo.findOne({
      where: { id },
      relations: [
        'roles',
        'roles.permissions', // load permission trong role
        'permissions', // load permission gán trực tiếp cho user
      ],
    });

    if (!user) return null;

    // chỉ lấy name của role
    const roleNames = user.roles?.map((r) => r.name) ?? [];

    // gộp quyền từ role
    const rolePermissions =
      user.roles?.flatMap((r) =>
        r.permissions?.map((p) => `${p.module}.${p.action}`),
      ) ?? [];

    // gộp quyền gán trực tiếp cho user
    const userPermissions =
      user.permissions?.map((p) => `${p.module}.${p.action}`) ?? [];

    const allPermissions = Array.from(
      new Set([...rolePermissions, ...userPermissions]),
    );

    return {
      email: user.email,
      roles: roleNames,
      permissions: allPermissions,
    };
  }

  findAll() {
    return this.repo.find();
  }
}
