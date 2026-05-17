import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { Tenant } from '../../database/entities/tenant.entity';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly repo: Repository<AdminUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async findAll(currentUser: AdminUser) {
    if (currentUser.role === AdminRole.OWNER) {
      // owner sees all superadmins (per-tenant top admins)
      const users = await this.repo.find({
        where: { role: AdminRole.SUPERADMIN, archivedAt: IsNull() },
        relations: ['tenant'],
        order: { createdAt: 'DESC' },
      });
      return users.map(this.sanitize);
    }
    if (currentUser.role === AdminRole.SUPERADMIN) {
      // superadmin sees admins in their tenant
      return (await this.repo.find({
        where: { role: AdminRole.ADMIN, tenantId: currentUser.tenantId!, archivedAt: IsNull() },
        order: { createdAt: 'DESC' },
      })).map(this.sanitize);
    }
    // admin sees moderators in their tenant
    return (await this.repo.find({
      where: { role: AdminRole.MODERATOR, tenantId: currentUser.tenantId!, archivedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })).map(this.sanitize);
  }

  async findArchived(currentUser: AdminUser) {
    const roleMap: Record<string, AdminRole> = {
      [AdminRole.OWNER]:      AdminRole.SUPERADMIN,
      [AdminRole.SUPERADMIN]: AdminRole.ADMIN,
      [AdminRole.ADMIN]:      AdminRole.MODERATOR,
    };
    const targetRole = roleMap[currentUser.role];
    if (!targetRole) return [];

    const qb = this.repo.createQueryBuilder('u')
      .where('u.role = :role', { role: targetRole })
      .andWhere('u.archived_at IS NOT NULL');

    if (currentUser.role === AdminRole.OWNER) {
      qb.leftJoinAndSelect('u.tenant', 'tenant');
    } else {
      qb.andWhere('u.tenant_id = :tid', { tid: currentUser.tenantId });
    }

    return (await qb.orderBy('u.archived_at', 'DESC').getMany()).map(this.sanitize);
  }

  async findByTenant(tenantId: number) {
    const users = await this.repo.find({
      where: { tenantId, role: AdminRole.ADMIN, archivedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return users.map(this.sanitize);
  }

  async create(dto: CreateAdminUserDto, currentUser: AdminUser) {
    const exists = await this.repo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('اسم المستخدم مستخدم بالفعل');

    if (currentUser.role === AdminRole.ADMIN) {
      const user = this.repo.create({
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        fullName: dto.fullName,
        role: AdminRole.MODERATOR,
        tenantId: currentUser.tenantId,
        permissions: [],
      });
      return this.sanitize(await this.repo.save(user));
    }

    if (currentUser.role === AdminRole.SUPERADMIN) {
      const user = this.repo.create({
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        fullName: dto.fullName,
        role: AdminRole.ADMIN,
        tenantId: currentUser.tenantId,
        permissions: [],
      });
      return this.sanitize(await this.repo.save(user));
    }

    // Owner creates superadmin + auto-creates tenant
    let tenantId = dto.tenantId;
    if (!tenantId) {
      const subdomain = this.toSubdomain(dto.businessName || dto.fullName || dto.email);
      const tenantName = dto.businessName || dto.fullName?.trim() || dto.email;
      const tenant = await this.tenantRepo.save(
        this.tenantRepo.create({ name: tenantName, subdomain, businessName: dto.businessName, isActive: true }),
      );
      tenantId = tenant.id;
    } else {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const user = this.repo.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      fullName: dto.fullName,
      role: AdminRole.SUPERADMIN,
      tenantId,
      permissions: [],
    });
    return this.sanitize(await this.repo.save(user));
  }

  async update(id: number, dto: UpdateAdminUserDto, currentUser: AdminUser) {
    const user = await this.findOwnedUser(id, currentUser);

    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 12);
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    return this.sanitize(await this.repo.save(user));
  }

  async getPermissions(id: number, currentUser: AdminUser) {
    const user = await this.findOwnedUser(id, currentUser);
    return { permissions: user.permissions ?? [] };
  }

  async setPermissions(id: number, permissions: string[], currentUser: AdminUser) {
    const user = await this.findOwnedUser(id, currentUser);
    user.permissions = permissions;
    return this.sanitize(await this.repo.save(user));
  }

  async archive(id: number, currentUser: AdminUser) {
    const user = await this.findOwnedUser(id, currentUser);
    user.archivedAt = new Date();
    user.isActive = false;
    await this.repo.save(user);

    if (currentUser.role === AdminRole.OWNER && user.tenantId) {
      await this.tenantRepo.update(user.tenantId, { isArchived: true, isActive: false });
    }
    return { message: 'تم نقل الحساب إلى الأرشيف' };
  }

  async restore(id: number, currentUser: AdminUser) {
    const user = await this.repo
      .createQueryBuilder('u')
      .where('u.id = :id', { id })
      .andWhere('u.archived_at IS NOT NULL')
      .getOne();
    if (!user) throw new NotFoundException(`Archived user ${id} not found`);
    this.assertOwnership(user, currentUser);

    user.archivedAt = null;
    user.isActive = true;
    await this.repo.save(user);

    if (currentUser.role === AdminRole.OWNER && user.tenantId) {
      await this.tenantRepo.update(user.tenantId, { isArchived: false, isActive: true });
    }
    return { message: 'تم استرجاع الحساب' };
  }

  async permanentDelete(id: number, currentUser: AdminUser) {
    const user = await this.repo
      .createQueryBuilder('u')
      .where('u.id = :id', { id })
      .andWhere('u.archived_at IS NOT NULL')
      .getOne();
    if (!user) throw new NotFoundException(`Archived user ${id} not found`);
    this.assertOwnership(user, currentUser);

    const tenantId = user.tenantId;
    await this.repo.remove(user);

    if (currentUser.role === AdminRole.OWNER && tenantId) {
      await this.tenantRepo.delete(tenantId);
    }
    return { message: 'تم الحذف النهائي' };
  }

  async remove(id: number, currentUser: AdminUser) {
    return this.archive(id, currentUser);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private async findOwnedUser(id: number, currentUser: AdminUser): Promise<AdminUser> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    this.assertOwnership(user, currentUser);
    return user;
  }

  private assertOwnership(target: AdminUser, currentUser: AdminUser) {
    if (currentUser.role === AdminRole.OWNER) return;
    const allowed: Record<string, AdminRole> = {
      [AdminRole.SUPERADMIN]: AdminRole.ADMIN,
      [AdminRole.ADMIN]:      AdminRole.MODERATOR,
    };
    const canManage = allowed[currentUser.role];
    if (target.role !== canManage || target.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('ليس لديك صلاحية');
    }
  }

  private toSubdomain(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || `tenant-${Date.now()}`;
  }

  private sanitize(user: AdminUser) {
    const { passwordHash: _, ...safe } = user as AdminUser & { passwordHash: string };
    return safe;
  }
}
