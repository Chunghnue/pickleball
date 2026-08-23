import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.registerCustomer(dto);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('register/owner')
  registerOwner(@Body() dto: RegisterDto) {
    return this.authService.registerOwner(dto);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message:
        'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
