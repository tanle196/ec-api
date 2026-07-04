import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { AdminRolesController } from './admin-roles.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '@/permissions/entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [AdminRolesController],
  providers: [RolesService],
  exports: [TypeOrmModule],
})
export class RolesModule {}
