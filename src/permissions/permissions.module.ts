import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { AdminPermissionsController } from './admin-permissions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Permission])],
  controllers: [AdminPermissionsController],
  providers: [PermissionsService],
  exports: [TypeOrmModule],
})
export class PermissionsModule {}
