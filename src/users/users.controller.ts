import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@/roles/decorators/roles.decorator';
import { RolesGuard } from '@/roles/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { UserProfileDto } from './dto/user-profile.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiResponse({ status: 200, description: 'List of users' })
  findAll(@Query() pagination: PaginationDto) {
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
}
