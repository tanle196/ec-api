import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AssignUserPermissionsDto } from './dto/assign-permissions.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { UserDetailDto } from './dto/user-detail.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { UserPaginatedResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('user.read')
  @ApiOperation({ summary: 'List all users' })
  @ApiExtraModels(UserListQueryDto)
  @ApiResponse({ status: 200, type: UserPaginatedResponseDto })
  findAll(
    @Query() pagination: UserListQueryDto,
  ): Promise<UserPaginatedResponseDto> {
    return this.usersService.findAll(pagination);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getProfile(@CurrentUser() user: ICurrentUser): Promise<UserProfileDto> {
    const profile = await this.usersService.getUserProfile(user.id!);
    if (!profile) {
      throw new NotFoundException('User profile not found');
    }
    return profile;
  }

  @Get(':id')
  @Permissions('user.read')
  @ApiOperation({ summary: 'Get user by id with roles and permissions' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: UserDetailDto })
  findOne(@Param('id') id: string): Promise<UserDetailDto> {
    return this.usersService.findByIdWithRelations(id);
  }

  @Patch(':id')
  @Permissions('user.update')
  @ApiOperation({ summary: 'Update user fullName or avatar' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: UserDetailDto })
  async update(
    @Param('id') id: string,
    @Body() dto: { fullName?: string; avatar?: string },
  ): Promise<UserDetailDto> {
    await this.usersService.update(id, dto);
    return this.usersService.findByIdWithRelations(id);
  }

  @Delete(':id')
  @Permissions('user.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiNoContentResponse({ description: 'User deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.delete(id);
  }

  @Put(':id/roles')
  @Permissions('user.assign.role')
  @ApiOperation({ summary: 'Assign roles to user (replaces existing)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: UserDetailDto })
  assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<UserDetailDto> {
    return this.usersService.assignRoles(id, dto.roleIds);
  }

  @Put(':id/permissions')
  @Permissions('user.update')
  @ApiOperation({
    summary: 'Assign direct permissions to user (replaces existing)',
  })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: UserDetailDto })
  assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignUserPermissionsDto,
  ): Promise<UserDetailDto> {
    return this.usersService.assignPermissions(id, dto.permissionIds);
  }
}
