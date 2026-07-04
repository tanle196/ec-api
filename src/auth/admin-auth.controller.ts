import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { UserProfileDto } from '@/users/dto/user-profile.dto';
import { UsersService } from '@/users/users.service';
import { AuthService } from './auth.service';
import { ActiveDto } from './dtos/active.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { LoginDto } from './dtos/login.dto';
import { MessageResponseDto } from './dtos/message-response.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { TokenResponseDto } from './dtos/token-response.dto';
import { UserInformationResponseDto } from './dtos/user-response.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-auth-refresh.guard';

@ApiTags('Admin: auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Admin: đăng nhập trang quản trị' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Đăng nhập thành công',
    type: TokenResponseDto,
  })
  async login(@CurrentUser() user: ICurrentUser): Promise<TokenResponseDto> {
    return this.authService.adminLogin({ id: user.id! });
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Admin: lấy thông tin tài khoản đang đăng nhập' })
  @ApiResponse({
    status: 200,
    description: 'Current admin profile',
    type: UserProfileDto,
  })
  async me(@CurrentUser() user: ICurrentUser): Promise<UserProfileDto> {
    this.authService.assertAdminRole(user.roles);
    const profile = await this.usersService.getUserProfile(user.id!);
    if (!profile) {
      throw new NotFoundException('User not found');
    }
    return profile;
  }

  @Post('active')
  @ApiOperation({ summary: 'Admin: kích hoạt tài khoản' })
  @ApiBody({ type: ActiveDto })
  @ApiResponse({
    status: 200,
    description: 'Account activated successfully',
    type: UserInformationResponseDto,
  })
  async active(
    @Body() activeDto: ActiveDto,
  ): Promise<UserInformationResponseDto> {
    return this.authService.activeAccount(activeDto.token);
  }

  @Post('refresh')
  @ApiBearerAuth('refresh-token')
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Admin: làm mới access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokenResponseDto,
  })
  async refresh(@CurrentUser() user: ICurrentUser): Promise<TokenResponseDto> {
    if (!user.id || !user.refreshJti) {
      throw new UnauthorizedException();
    }
    this.authService.assertAdminRole(user.roles);
    return this.authService.rotateRefreshToken(user.id, user.refreshJti);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Admin: yêu cầu đặt lại mật khẩu' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if email exists',
    type: MessageResponseDto,
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<MessageResponseDto> {
    await this.authService.forgotPassword(forgotPasswordDto.email);
    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Admin: đặt lại mật khẩu bằng token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: MessageResponseDto,
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<MessageResponseDto> {
    await this.authService.resetPassword(
      resetPasswordDto.newPassword,
      resetPasswordDto.token,
    );
    return { message: 'Password has been reset successfully' };
  }
}
