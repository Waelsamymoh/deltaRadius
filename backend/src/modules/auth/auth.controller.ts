import { Controller, Post, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request & { resolvedTenantId?: number | null }) {
    return this.authService.login(dto, req.resolvedTenantId);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.OWNER, AdminRole.SUPERADMIN)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('setup-status')
  setupStatus() {
    return this.authService.setupStatus();
  }

  @Post('setup')
  setupFirstAdmin(@Body() dto: RegisterDto) {
    return this.authService.setupFirstAdmin(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: AdminUser) {
    return this.authService.profile(user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: AdminUser,
    @Body() body: { fullName?: string; currentPassword?: string; newPassword?: string },
  ) {
    return this.authService.updateProfile(user.id, body);
  }
}
