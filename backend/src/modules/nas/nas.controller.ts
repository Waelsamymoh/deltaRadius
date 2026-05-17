import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { NasService } from './nas.service';
import { CreateNasDto } from './dto/create-nas.dto';
import { UpdateNasDto } from './dto/update-nas.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminUser } from '../../database/entities/admin-user.entity';

@Controller('nas')
@UseGuards(JwtAuthGuard)
export class NasController {
  constructor(private readonly nasService: NasService) {}

  @Get()
  findAll(@CurrentUser() user: AdminUser) {
    return this.nasService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateNasDto, @CurrentUser() user: AdminUser) {
    return this.nasService.create(dto, user);
  }

  @Get(':id/check')
  checkRadius(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.checkRadius(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNasDto,
    @CurrentUser() user: AdminUser,
  ) {
    return this.nasService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AdminUser) {
    return this.nasService.remove(id, user);
  }
}
