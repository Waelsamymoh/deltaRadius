import {
  Controller, Get, Post, Res, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminRole, AdminUser } from '../../database/entities/admin-user.entity';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';

// Whole-database backup/restore — platform owner ONLY. This endpoint can read
// and overwrite every tenant's data, so it must never be exposed more widely.
@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  /** Download a full JSON snapshot of the database. */
  @Get('export')
  async export(@Res() res: Response) {
    const snapshot = await this.backupService.export();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="deltaRadius-backup-${stamp}.json"`,
    });
    res.send(JSON.stringify(snapshot));
  }

  /** Restore (full replace) from an uploaded JSON snapshot. */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  async import(@UploadedFile() file?: { buffer?: Buffer }) {
    if (!file?.buffer) throw new BadRequestException('لم يتم رفع أي ملف');
    let payload: any;
    try {
      payload = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('الملف ليس JSON صالحًا');
    }
    return this.backupService.import(payload);
  }
}

// Per-tenant backup/restore — a tenant admin backs up ONLY their own data.
// Owner/superadmin/admin only. Superadmin/admin are pinned to their tenant;
// the owner may target any tenant via ?tenantId=.
@Controller('tenant-backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER, AdminRole.SUPERADMIN, AdminRole.ADMIN)
export class TenantBackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  async export(
    @Res() res: Response,
    @CurrentUser() user: AdminUser,
    @Query('tenantId') tenantId?: string,
  ) {
    const tid = getScopedTenantId(user, tenantId ? +tenantId : undefined);
    if (tid === null) throw new BadRequestException('يجب تحديد العميل');
    const snapshot = await this.backupService.exportTenant(tid);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tenant-${tid}-backup-${stamp}.json"`,
    });
    res.send(JSON.stringify(snapshot));
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  async import(
    @CurrentUser() user: AdminUser,
    @UploadedFile() file?: { buffer?: Buffer },
    @Query('tenantId') tenantId?: string,
  ) {
    const tid = getScopedTenantId(user, tenantId ? +tenantId : undefined);
    if (tid === null) throw new BadRequestException('يجب تحديد العميل');
    if (!file?.buffer) throw new BadRequestException('لم يتم رفع أي ملف');
    let payload: any;
    try {
      payload = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('الملف ليس JSON صالحًا');
    }
    return this.backupService.importTenant(payload, tid);
  }
}
