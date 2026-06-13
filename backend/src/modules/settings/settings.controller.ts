import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../database/entities/admin-user.entity';

class TimezoneDto {
  @IsString() timezone: string;
}

class TimeConfigDto {
  @IsIn(['auto', 'manual']) mode: 'auto' | 'manual';
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() datetime?: string; // wall-clock for manual mode
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any authenticated user can read the system timezone. */
  @Get('timezone')
  async getTimezone() {
    return { timezone: await this.settings.getTimezone() };
  }

  /** Full time config + the current system clock. */
  @Get('time')
  async getTime() {
    const { now, today, config } = await this.settings.getSystemNow();
    return { ...config, now, today };
  }

  /** Only the platform owner can change the system timezone (legacy endpoint). */
  @Put('timezone')
  @Roles(AdminRole.OWNER)
  setTimezone(@Body() dto: TimezoneDto) {
    return this.settings.setTimezone(dto.timezone);
  }

  /** Only the platform owner can change the system time configuration. */
  @Put('time')
  @Roles(AdminRole.OWNER)
  setTime(@Body() dto: TimeConfigDto) {
    return this.settings.setTimeConfig(dto);
  }
}
