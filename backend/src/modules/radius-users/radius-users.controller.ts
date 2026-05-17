import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { RadiusUsersService } from './radius-users.service';
import { CreateRadiusUserDto } from './dto/create-user.dto';
import { UpdateRadiusUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('radius-users')
@UseGuards(JwtAuthGuard)
export class RadiusUsersController {
  constructor(private readonly radiusUsersService: RadiusUsersService) {}

  @Get()
  findAll(@CurrentUser() user: AdminUser) {
    return this.radiusUsersService.findAll(user);
  }

  @Get(':username/stats')
  getStats(@Param('username') username: string, @CurrentUser() user: AdminUser) {
    return this.radiusUsersService.getStats(username, user);
  }

  @Post(':username/kick')
  kick(@Param('username') username: string) {
    return this.radiusUsersService.kickUser(username);
  }

  @Get(':username')
  findOne(@Param('username') username: string, @CurrentUser() user: AdminUser) {
    return this.radiusUsersService.findOne(username, user);
  }

  @Post()
  create(@Body() dto: CreateRadiusUserDto, @CurrentUser() user: AdminUser) {
    return this.radiusUsersService.create(dto, user);
  }

  @Patch(':username')
  update(
    @Param('username') username: string,
    @Body() dto: UpdateRadiusUserDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.radiusUsersService.update(username, dto, user);
  }

  @Delete(':username')
  remove(@Param('username') username: string, @CurrentUser() user: AdminUser) {
    return this.radiusUsersService.remove(username, user);
  }
}
