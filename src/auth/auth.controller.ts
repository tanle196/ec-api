import {
  Body,
  Controller,
  Get,
  Post,
  Req,
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
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { AuthService } from './auth.service';
import { ActiveDto } from './dtos/active.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { LoginDto } from './dtos/login.dto';
import { MessageResponseDto } from './dtos/message-response.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { TokenResponseDto } from './dtos/token-response.dto';
import { UserInformationResponseDto } from './dtos/user-response.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-auth-refresh.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TokenResponseDto,
  })
  async login(@CurrentUser() user: ICurrentUser): Promise<TokenResponseDto> {
    return this.authService.generateTokens({ id: user.id! });
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'User registration' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: MessageResponseDto,
  })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<MessageResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('active')
  @ApiOperation({ summary: 'Activate user account' })
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
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokenResponseDto,
  })
  async refresh(@CurrentUser() user: ICurrentUser): Promise<TokenResponseDto> {
    if (!user.id || !user.refreshJti) {
      throw new UnauthorizedException();
    }
    return this.authService.rotateRefreshToken(user.id, user.refreshJti);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request password reset' })
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
  @ApiOperation({ summary: 'Reset password with token' })
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

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth login' })
  googleLogin() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Google login successful',
    type: TokenResponseDto,
  })
  async googleCallback(
    @Req() req: { user: ICurrentUser },
  ): Promise<TokenResponseDto> {
    return this.authService.generateTokens({ id: req.user.id! });
  }
}
