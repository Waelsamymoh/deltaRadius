import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { TopupsService } from './topups.service';
import { CreateTopupPackageDto, UpdateTopupPackageDto, ApplyTopupDto } from './dto/topup-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class TopupsController {
  constructor(private readonly svc: TopupsService) {}

  // ── Packages ────────────────────────────────────────────────────
  @Get('topup-packages')
  listPackages(@Req() req: any) { return this.svc.listPackages(req.user); }

  @Get('topup-packages/:id')
  getPackage(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.getPackage(id, req.user);
  }

  @Post('topup-packages')
  createPackage(@Body() dto: CreateTopupPackageDto, @Req() req: any) {
    return this.svc.createPackage(dto, req.user);
  }

  @Patch('topup-packages/:id')
  updatePackage(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTopupPackageDto, @Req() req: any) {
    return this.svc.updatePackage(id, dto, req.user);
  }

  @Delete('topup-packages/:id')
  removePackage(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.deletePackage(id, req.user);
  }

  // ── Apply to user / view history ────────────────────────────────
  @Post('radius-users/:username/topup')
  applyTopup(@Param('username') username: string, @Body() dto: ApplyTopupDto, @Req() req: any) {
    return this.svc.applyToUser(username, dto.packageId, req.user);
  }

  @Get('radius-users/:username/topups')
  userTopups(@Param('username') username: string, @Req() req: any) {
    return this.svc.getUserTopups(username, req.user);
  }
}
