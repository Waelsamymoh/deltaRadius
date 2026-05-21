import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { OwnerAssistantsService } from './owner-assistants.service';
import { CreateOwnerAssistantDto } from './dto/create-owner-assistant.dto';
import { UpdateOwnerAssistantDto } from './dto/update-owner-assistant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../database/entities/admin-user.entity';

@Controller('owner-assistants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER)
export class OwnerAssistantsController {
  constructor(private readonly service: OwnerAssistantsService) {}

  @Get('permissions')
  listPermissions() {
    return this.service.listAvailablePermissions();
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateOwnerAssistantDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOwnerAssistantDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
