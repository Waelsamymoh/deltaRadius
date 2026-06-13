import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesReceipt } from '../../database/entities/sales-receipt.entity';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { getScopedTenantId } from '../../common/helpers/tenant.helper';

@Injectable()
export class SalesReceiptsService {
  constructor(
    @InjectRepository(SalesReceipt)
    private readonly repo: Repository<SalesReceipt>,
  ) {}

  /** List receipts for the caller's tenant.
   *  - Tenant-side assistants see ONLY their own receipts.
   *  - Superadmin/admin (and owner via override) see all receipts in the tenant,
   *    optionally narrowed by adminId.
   */
  async list(
    user: AdminUser,
    overrideTenantId?: number,
    filters?: { adminId?: number; from?: string; to?: string },
  ) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('لا يوجد عميل مرتبط بحسابك');

    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.tenantId = :tenantId', { tenantId })
      .orderBy('r.paidAt', 'DESC');

    // Assistants are pinned to their own receipts
    const isFullAccess =
      user.role === AdminRole.OWNER ||
      user.role === AdminRole.SUPERADMIN ||
      user.role === AdminRole.ADMIN;
    if (!isFullAccess) {
      qb.andWhere('r.adminId = :uid', { uid: user.id });
    } else if (filters?.adminId) {
      qb.andWhere('r.adminId = :fid', { fid: filters.adminId });
    }

    if (filters?.from) qb.andWhere('r.paidAt >= :from', { from: filters.from });
    if (filters?.to)   qb.andWhere('r.paidAt <  :to',   { to:   filters.to });

    return qb.getMany();
  }

  /** Per-supervisor summary for a tenant — useful for the admin's "team" view.
   *  Returns { adminId, adminEmail, adminName, count, totalPrice }. */
  async summaryByAdmin(user: AdminUser, overrideTenantId?: number, filters?: { from?: string; to?: string }) {
    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('لا يوجد عميل مرتبط بحسابك');

    const qb = this.repo
      .createQueryBuilder('r')
      .select('r.adminId',    'adminId')
      .addSelect('r.adminEmail', 'adminEmail')
      .addSelect('r.adminName',  'adminName')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('COALESCE(SUM(r.price),0)::numeric', 'totalPrice')
      .where('r.tenantId = :tenantId', { tenantId })
      .groupBy('r.adminId')
      .addGroupBy('r.adminEmail')
      .addGroupBy('r.adminName')
      .orderBy('"totalPrice"', 'DESC');

    if (filters?.from) qb.andWhere('r.paidAt >= :from', { from: filters.from });
    if (filters?.to)   qb.andWhere('r.paidAt <  :to',   { to:   filters.to });

    return qb.getRawMany<{ adminId: number; adminEmail: string; adminName: string; count: number; totalPrice: string }>();
  }

  /** Delete a single receipt. Full-access roles (owner/superadmin/admin) only,
   *  and only within their own tenant. */
  async remove(user: AdminUser, id: number, overrideTenantId?: number) {
    const isFullAccess =
      user.role === AdminRole.OWNER ||
      user.role === AdminRole.SUPERADMIN ||
      user.role === AdminRole.ADMIN;
    if (!isFullAccess) throw new ForbiddenException('غير مصرح بحذف الفواتير');

    const tenantId = getScopedTenantId(user, overrideTenantId);
    if (tenantId === null) throw new BadRequestException('لا يوجد عميل مرتبط بحسابك');

    const receipt = await this.repo.findOne({ where: { id, tenantId } as any });
    if (!receipt) throw new NotFoundException(`الفاتورة ${id} غير موجودة`);

    await this.repo.remove(receipt);
    return { message: `تم حذف الفاتورة ${id}` };
  }
}
