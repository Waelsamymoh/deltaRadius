import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Tenant } from '../../database/entities/tenant.entity';
import { AdminUser, AdminRole } from '../../database/entities/admin-user.entity';
import { Nas } from '../../database/entities/nas.entity';
import { RadCheck } from '../../database/entities/radcheck.entity';
import { RadAcct } from '../../database/entities/radacct.entity';
import { Plan } from '../../database/entities/plan.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { VoucherCard } from '../../database/entities/voucher-card.entity';
import { TopupPackage } from '../../database/entities/topup-package.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const execAsync = promisify(exec);
const CHAP_SECRETS = '/etc/ppp/chap-secrets';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>,
    @InjectRepository(Nas)
    private readonly nasRepo: Repository<Nas>,
    @InjectRepository(RadCheck)
    private readonly radCheckRepo: Repository<RadCheck>,
    @InjectRepository(RadAcct)
    private readonly radAcctRepo: Repository<RadAcct>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepo: Repository<UserProfile>,
    @InjectRepository(VoucherCard)
    private readonly voucherRepo: Repository<VoucherCard>,
    @InjectRepository(TopupPackage)
    private readonly topupPackageRepo: Repository<TopupPackage>,
  ) {}

  async findAll(includeArchived = false) {
    const tenants = await this.tenantRepo.find({
      where: includeArchived ? undefined : { isArchived: false },
      order: { createdAt: 'DESC' },
    });
    if (tenants.length === 0) return tenants;

    // Enrich each tenant with its NAS IPs (each NAS = one static IP from the
    // pool). New tenants no longer get a tenant-level SSTP IP, so the UI
    // needs the per-NAS list to render "IP الثابت" correctly.
    const nasRows = await this.nasRepo
      .createQueryBuilder('n')
      .select(['n.tenantId', 'n.nasname'])
      .where('n.tenantId IN (:...ids)', { ids: tenants.map(t => t.id) })
      .getMany();

    const nasByTenant = new Map<number, string[]>();
    for (const n of nasRows) {
      if (!n.tenantId || !n.nasname) continue;
      const arr = nasByTenant.get(n.tenantId) ?? [];
      arr.push(n.nasname);
      nasByTenant.set(n.tenantId, arr);
    }

    return tenants.map(t => ({
      ...t,
      nasIps: nasByTenant.get(t.id) ?? [],
    }));
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  /** Tenant-scoped settings used by the admin UI. Currently exposes the
   *  default expiry time-of-day used by FreeRADIUS on renewal. */
  async getSettings(tenantId: number) {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant not found');
    return { defaultExpiryTime: t.defaultExpiryTime ?? '12:00' };
  }

  async updateSettings(tenantId: number, dto: { defaultExpiryTime?: string }) {
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant not found');
    if (dto.defaultExpiryTime !== undefined) {
      // Validate HH:MM (24h)
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(dto.defaultExpiryTime)) {
        throw new ConflictException('صيغة الوقت غير صحيحة (HH:MM)');
      }
      t.defaultExpiryTime = dto.defaultExpiryTime;
    }
    await this.tenantRepo.save(t);
    return { defaultExpiryTime: t.defaultExpiryTime };
  }

  async create(dto: CreateTenantDto) {
    const exists = await this.tenantRepo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Tenant name already exists');

    // SSTP credentials are created when:
    //   • Both username and password are explicitly provided, OR
    //   • autoGenerateSstp flag is true (used by owner's "create network" flow)
    // Landing-page self-registration sends neither → no SSTP.
    const hasExplicitSstp = !!(dto.sstpUsername?.trim() && dto.sstpPassword?.trim());
    const shouldCreateSstp = hasExplicitSstp || !!dto.autoGenerateSstp;

    let sstpUsername: string | null = null;
    let sstpPassword: string | null = null;
    let sstpIp:       string | null = null;

    if (shouldCreateSstp) {
      sstpUsername = dto.sstpUsername?.trim()
        || await this.generateUniqueUsername(dto.subdomain || dto.name);
      sstpPassword = dto.sstpPassword?.trim() || this.generatePassword();
      sstpIp = (dto.sstpIp?.trim()) || await this.allocateStaticIp();
      if (dto.sstpIp?.trim()) await this.validateIpAvailable(dto.sstpIp.trim());
    }

    // Strip the autoGenerateSstp flag — it isn't an entity column
    const { autoGenerateSstp: _, ...rest } = dto;
    const tenant = this.tenantRepo.create({
      ...rest,
      sstpUsername,
      sstpPassword,
      sstpIp,
    });
    const saved = await this.tenantRepo.save(tenant);

    // Sync chap-secrets only — DO NOT create an auto-NAS row. Tenant adds
    // NAS devices manually from the "Add NAS" flow (each device gets its own
    // SSTP user + static IP). Tenant-level SSTP creds, when present, still
    // map to a chap-secrets entry so the tenant can also log in directly.
    if (sstpUsername && sstpPassword && sstpIp) {
      this.chapAddOrUpdate(sstpUsername, sstpPassword, sstpIp);
    }
    return saved;
  }

  /** Generate SSTP credentials for an existing tenant (separate flow) */
  async generateSstp(id: number): Promise<Tenant> {
    const tenant = await this.findOne(id);
    if (tenant.sstpUsername && tenant.sstpPassword && tenant.sstpIp) {
      throw new ConflictException('للعميل بالفعل بيانات SSTP');
    }
    tenant.sstpUsername = await this.generateUniqueUsername(tenant.subdomain || tenant.name);
    tenant.sstpPassword = this.generatePassword();
    tenant.sstpIp       = await this.allocateStaticIp();
    const saved = await this.tenantRepo.save(tenant);
    this.chapAddOrUpdate(saved.sstpUsername!, saved.sstpPassword!, saved.sstpIp!);
    return saved;
  }

  /** Regenerate SSTP password (and username if missing). Keeps the static IP. Owner-only. */
  async regenerateSstpCredentials(id: number): Promise<Tenant> {
    const tenant = await this.findOne(id);
    const oldUsername = tenant.sstpUsername;
    if (!tenant.sstpUsername) {
      tenant.sstpUsername = await this.generateUniqueUsername(tenant.subdomain || tenant.name);
    }
    tenant.sstpPassword = this.generatePassword();
    if (!tenant.sstpIp) {
      tenant.sstpIp = await this.allocateStaticIp();
    }
    const saved = await this.tenantRepo.save(tenant);
    if (oldUsername && oldUsername !== saved.sstpUsername) this.chapRemove(oldUsername);
    this.chapAddOrUpdate(saved.sstpUsername!, saved.sstpPassword!, saved.sstpIp!);
    return saved;
  }

  /** Summary counts + recent activity for the per-tenant dashboard.
   *  Each count comes from the canonical table for that resource — never
   *  from radcheck, which mixes RADIUS users with voucher card rows. */
  async getSummary(id: number) {
    const tenant = await this.findOne(id);
    const [users, nas, plans, cards, topups, activeSessions, totalSessions] = await Promise.all([
      this.userProfileRepo.count({ where: { tenantId: id } as any }),
      this.nasRepo.count({ where: { tenantId: id } }),
      this.planRepo.count({ where: { tenantId: id } as any }),
      this.voucherRepo.count({ where: { tenantId: id } as any }),
      this.topupPackageRepo.count({ where: { tenantId: id } as any }),
      this.radAcctRepo
        .createQueryBuilder('ra')
        .where('ra.tenant_id = :id', { id })
        .andWhere(`ra.acctstoptime IS NULL`)
        .andWhere(`(
          ra.acctupdatetime > NOW() - INTERVAL '10 minutes'
          OR (ra.acctupdatetime IS NULL AND ra.acctstarttime > NOW() - INTERVAL '10 minutes')
        )`)
        .getCount(),
      this.radAcctRepo.count({ where: { tenantId: id } }),
    ]);
    return {
      tenant,
      counts: { users, nas, plans, cards, topups, activeSessions, totalSessions },
    };
  }

  /** Build a MikroTik RouterOS script that configures SSTP + RADIUS */
  buildMikrotikScript(tenant: Tenant, sstpServer = 'sstp2.delta-group.online', sstpPort = 442): string {
    if (!tenant.sstpUsername || !tenant.sstpPassword) {
      throw new BadRequestException('لا توجد بيانات SSTP لهذا العميل');
    }
    const lines = [
      '# DeltaRadius — MikroTik SSTP + RADIUS setup',
      `# Tenant: ${tenant.name}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      '# 1) SSTP client to DeltaRadius server',
      '/interface sstp-client',
      `add name=delta-sstp connect-to=${sstpServer}:${sstpPort} \\`,
      `    user="${tenant.sstpUsername}" password="${tenant.sstpPassword}" \\`,
      '    authentication=mschap2,mschap1 profile=default-encryption \\',
      '    add-default-route=no disabled=no',
      '',
      '# 2) RADIUS — point to DeltaRadius gateway through the SSTP tunnel',
      '/radius',
      `add address=196.88.0.1 secret="${tenant.sstpPassword}" \\`,
      '    service=ppp,hotspot,wireless src-address=' + (tenant.sstpIp ?? '0.0.0.0') + ' timeout=3s',
      '',
      '# 3) Allow CoA / Disconnect-Request from server',
      '/radius incoming',
      'set accept=yes port=3799',
      '',
      '# 4) Enable RADIUS auth for PPP (PPPoE, hotspot, etc.)',
      '/ppp aaa',
      'set use-radius=yes accounting=yes interim-update=1m',
      '',
      '# Optional: enable RADIUS for hotspot profile',
      '# /ip hotspot profile set hsprof1 use-radius=yes',
    ];
    return lines.join('\n') + '\n';
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.findOne(id);
    const oldUsername = tenant.sstpUsername;

    // ── IP handling: the static IP is locked after creation ──
    //   • blank/undefined in dto  → keep current IP (no change)
    //   • explicit null in dto    → clear (revert to dynamic)
    //   • non-blank value         → validate & set new IP
    const newIp = dto.sstpIp;
    delete (dto as any).sstpIp; // strip so Object.assign below doesn't touch it
    Object.assign(tenant, dto);

    if (newIp === null) {
      tenant.sstpIp = null;
    } else if (typeof newIp === 'string' && newIp.trim() !== '' && newIp.trim() !== tenant.sstpIp) {
      await this.validateIpAvailable(newIp.trim(), id);
      tenant.sstpIp = newIp.trim();
    }
    // else: blank string or undefined → keep tenant.sstpIp as is

    // If SSTP credentials just got added (was null, now both set) and no IP yet,
    // allocate one automatically so the user gets a static IP from the pool.
    if (tenant.sstpUsername && tenant.sstpPassword && !tenant.sstpIp) {
      tenant.sstpIp = await this.allocateStaticIp();
    }

    const saved = await this.tenantRepo.save(tenant);
    // remove old chap-secrets entry if username changed/cleared
    if (oldUsername && oldUsername !== saved.sstpUsername) {
      this.chapRemove(oldUsername);
    }
    // write/update chap-secrets only if SSTP credentials are set
    // (no auto-NAS — tenants manage their NAS devices manually).
    if (saved.sstpUsername && saved.sstpPassword) {
      this.chapAddOrUpdate(saved.sstpUsername, saved.sstpPassword, saved.sstpIp ?? '*');
    }
    return saved;
  }

  async resetAdminPassword(tenantId: number, newPassword: string) {
    if (!newPassword || newPassword.length < 6)
      throw new BadRequestException('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    const admin = await this.adminUserRepo.findOne({
      where: { tenantId, role: AdminRole.SUPERADMIN },
      order: { id: 'ASC' },
    });
    if (!admin) throw new NotFoundException('لا يوجد مدير لهذا العميل');
    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.adminUserRepo.save(admin);
    return { message: 'تم تغيير كلمة المرور بنجاح', adminEmail: admin.email };
  }

  /**
   * Soft-delete: archive the tenant. Kicks every SSTP session belonging to
   * this tenant (own + each NAS), and removes those entries from chap-secrets
   * so they can't reconnect. Original passwords are kept on the entities, so
   * `restore()` can rebuild the chap-secrets entries verbatim.
   *
   * accel-cmd is used to drop active sessions WITHOUT restarting the SSTP
   * service — other tenants stay connected.
   */
  async archive(id: number): Promise<Tenant> {
    const tenant = await this.findOne(id);
    if (tenant.isArchived) return tenant;

    // 1. Collect every SSTP username belonging to this tenant
    const usernames: string[] = [];
    if (tenant.sstpUsername) usernames.push(tenant.sstpUsername);

    const nasRows = await this.nasRepo.find({ where: { tenantId: id } });
    for (const nas of nasRows) {
      let u = nas.sstpUsername;
      if (!u && nas.nasname) {
        // Legacy row without persisted username — read from chap-secrets and backfill
        u = this.findChapUsernameByIp(nas.nasname);
        if (u) { nas.sstpUsername = u; await this.nasRepo.save(nas); }
      }
      if (u) usernames.push(u);
    }

    // 2. Kick active accel-ppp sessions for each (best-effort, doesn't block archive)
    for (const u of usernames) {
      try {
        await execAsync(`/usr/local/bin/accel-cmd -p 2000 terminate match username ${u} soft`, { timeout: 3000 });
      } catch { /* user might not be connected — that's fine */ }
    }

    // 3. Remove chap-secrets entries so they can't reconnect
    for (const u of usernames) this.chapRemove(u);

    // 4. Mark archived + inactive (UI hides it from the active list)
    tenant.isArchived = true;
    tenant.isActive   = false;
    return await this.tenantRepo.save(tenant);
  }

  /**
   * Restore an archived tenant: re-add chap-secrets entries from the stored
   * credentials (tenant + each NAS). Reactivates the tenant.
   */
  async restore(id: number): Promise<Tenant> {
    const tenant = await this.findOne(id);
    if (!tenant.isArchived) return tenant;

    // Tenant's own SSTP (if any)
    if (tenant.sstpUsername && tenant.sstpPassword) {
      this.chapAddOrUpdate(tenant.sstpUsername, tenant.sstpPassword, tenant.sstpIp ?? '*');
    }
    // Each NAS — need sstpUsername (from column) + secret + nasname (IP)
    const nasRows = await this.nasRepo.find({ where: { tenantId: id } });
    for (const nas of nasRows) {
      if (nas.sstpUsername && nas.secret && nas.nasname) {
        this.chapAddOrUpdate(nas.sstpUsername, nas.secret, nas.nasname);
      }
    }

    tenant.isArchived = false;
    tenant.isActive   = true;
    return await this.tenantRepo.save(tenant);
  }

  /** Hard-delete an archived tenant — owner-only, irreversible. */
  async removePermanent(id: number) {
    const tenant = await this.findOne(id);
    if (!tenant.isArchived) {
      throw new ConflictException('يجب أرشفة العميل أولاً قبل الحذف النهائي');
    }
    // Safety: re-run the chap-secrets cleanup in case anything was re-added manually
    if (tenant.sstpUsername) this.chapRemove(tenant.sstpUsername);
    const nasRows = await this.nasRepo.find({ where: { tenantId: id } });
    for (const nas of nasRows) {
      if (nas.sstpUsername) this.chapRemove(nas.sstpUsername);
    }
    await this.tenantRepo.remove(tenant);
    return { message: `Tenant ${id} permanently deleted` };
  }

  // ── Public helpers used by other modules (NAS) ────────────────────────────

  /** Allocate the next available static IP from the pool. Checks BOTH the
   *  tenants table AND chap-secrets so NAS-tied standalone SSTP users count. */
  async allocateStaticIpPublic(): Promise<string> {
    return this.allocateStaticIp();
  }

  /** True when the given SSTP username already exists (tenants or chap-secrets). */
  async sstpUsernameExists(username: string): Promise<boolean> {
    if (!username) return false;
    const t = await this.tenantRepo.findOne({ where: { sstpUsername: username } });
    if (t) return true;
    return this.chapRead().some(u => u.username === username);
  }

  /** Add or update an entry in /etc/ppp/chap-secrets. */
  upsertChapEntry(username: string, password: string, ip: string = '*'): void {
    this.chapAddOrUpdate(username, password, ip);
  }

  /** Remove an SSTP user from /etc/ppp/chap-secrets. */
  removeChapEntry(username: string): void {
    this.chapRemove(username);
  }

  /** Look up the SSTP username in chap-secrets that holds the given static IP.
   *  Returns null if no entry matches. Used by NAS deletion to clean up the
   *  paired SSTP account. */
  findChapUsernameByIp(ip: string): string | null {
    if (!ip) return null;
    const u = this.chapRead().find(e => e.ip === ip);
    return u?.username ?? null;
  }

  /** Generate a unique SSTP username from a seed (e.g. tenant name / "nas"). */
  async generateUniqueSstpUsername(seed: string): Promise<string> {
    const base = (seed || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'nas';
    let candidate = base;
    let n = 1;
    while (await this.sstpUsernameExists(candidate)) {
      candidate = `${base}${n++}`;
    }
    return candidate;
  }

  /** Generate a fully random unique SSTP username — independent of any user input. */
  async generateRandomSstpUsername(): Promise<string> {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let suffix = '';
      for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
      const candidate = `nas-${suffix}`;
      if (!(await this.sstpUsernameExists(candidate))) return candidate;
    }
    // Fallback — extremely unlikely with 31^6 ≈ 887M combinations
    return `nas-${Date.now().toString(36)}`;
  }

  /** Generate a random readable SSTP password. */
  generateSstpPassword(): string {
    return this.generatePassword();
  }

  // ── chap-secrets helpers ──────────────────────────────────────────────────

  private chapRead(): Array<{ username: string; server: string; password: string; ip: string }> {
    try {
      return fs.readFileSync(CHAP_SECRETS, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(l => {
          const p = l.split(/\s+/);
          return { username: p[0] ?? '', server: p[1] ?? '*', password: p[2] ?? '', ip: p[3] ?? '*' };
        })
        .filter(u => u.username);
    } catch { return []; }
  }

  private chapWrite(users: Array<{ username: string; server: string; password: string; ip: string }>) {
    const header = '# SSTP / PPP chap-secrets — managed by DeltaRadius\n';
    const body = users.map(u => `${u.username}\t${u.server}\t${u.password}\t${u.ip}`).join('\n');
    fs.writeFileSync(CHAP_SECRETS, header + body + (body ? '\n' : ''), { mode: 0o640 });
    // tell accel-ppp to reload the file so static IPs apply to new connections
    execAsync('/usr/local/bin/accel-cmd -p 2000 reload', { timeout: 3000 }).catch(() => {});
  }

  private chapAddOrUpdate(username: string, password: string, ip: string = '*') {
    const users = this.chapRead();
    const idx = users.findIndex(u => u.username === username);
    if (idx >= 0) { users[idx].password = password; users[idx].ip = ip; }
    else users.push({ username, server: '*', password, ip });
    this.chapWrite(users);
  }

  private chapRemove(username: string) {
    const users = this.chapRead().filter(u => u.username !== username);
    this.chapWrite(users);
  }

  // ── auto-generation helpers ───────────────────────────────────────────────

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  private async generateUniqueUsername(seed: string): Promise<string> {
    const base = (seed || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'client';
    let candidate = base;
    let n = 1;
    while (await this.tenantRepo.findOne({ where: { sstpUsername: candidate } })) {
      candidate = `${base}${n++}`;
    }
    return candidate;
  }

  // ── IP allocation helpers ─────────────────────────────────────────────────

  private async validateIpAvailable(ip: string, excludeTenantId?: number): Promise<void> {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip))
      throw new BadRequestException('صيغة IP غير صحيحة');
    const existing = await this.tenantRepo.findOne({ where: { sstpIp: ip } });
    if (existing && existing.id !== excludeTenantId)
      throw new ConflictException(`الـ IP ${ip} مُستخدم من قبل العميل ${existing.name}`);
  }

  private async allocateStaticIp(): Promise<string> {
    const [start, end] = this.readPoolRange();
    const used = new Set<string>();

    // 1. Tenant-level SSTP IPs (legacy)
    const tRows = await this.tenantRepo
      .createQueryBuilder('t')
      .select('t.sstp_ip', 'ip')
      .where('t.sstp_ip IS NOT NULL')
      .getRawMany<{ ip: string }>();
    for (const r of tRows) if (r.ip) used.add(r.ip);

    // 2. Every nas.nasname that looks like an IP — covers NAS rows owned by
    //    archived tenants, where the chap-secrets entry is gone but the row
    //    still exists. Without this check the allocator would hand the same
    //    IP to a new tenant and break the archived one on restore.
    const nRows = await this.nasRepo
      .createQueryBuilder('n')
      .select('n.nasname', 'nasname')
      .getRawMany<{ nasname: string }>();
    for (const r of nRows) {
      if (r.nasname && /^(\d{1,3}\.){3}\d{1,3}$/.test(r.nasname)) used.add(r.nasname);
    }

    // 3. chap-secrets static IPs (live SSTP users)
    for (const u of this.chapRead()) {
      if (u.ip && u.ip !== '*' && /^(\d{1,3}\.){3}\d{1,3}$/.test(u.ip)) used.add(u.ip);
    }

    for (let n = start; n <= end; n++) {
      const ip = this.numberToIp(n);
      if (!used.has(ip)) return ip;
    }
    throw new ConflictException('لم يعد هناك IPs متاحة في الـ pool — وسّع النطاق من إعدادات SSTP');
  }

  private readPoolRange(): [number, number] {
    try {
      const content = fs.readFileSync('/etc/accel-ppp/accel-ppp.conf', 'utf8');
      const section = content.match(/\[ip-pool\]([\s\S]*?)(?=\n\[|$)/);
      if (section) {
        const m = section[1].match(/(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)/);
        if (m) {
          let s = this.ipToNumber(m[1]);
          let e = this.ipToNumber(m[2]);
          if (s > e) [s, e] = [e, s];
          const gw = section[1].match(/gw-ip-address=(\d+\.\d+\.\d+\.\d+)/)?.[1];
          if (gw && this.ipToNumber(gw) === s) s++;
          return [s, e];
        }
      }
    } catch { /* fall through to default */ }
    return [this.ipToNumber('10.100.0.10'), this.ipToNumber('10.100.0.254')];
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((a, p) => a * 256 + parseInt(p, 10), 0);
  }

  private numberToIp(n: number): string {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
  }

  // ── Auto-NAS sync ─────────────────────────────────────────────────────────
  /**
   * Create (or update) a NAS entry tied to this tenant. The auto-NAS:
   *   nasname     = tenant.sstpIp        (the static SSTP IP)
   *   shortname   = tenant.name          (display label)
   *   secret      = tenant.sstpPassword  (matches MikroTik RADIUS secret)
   *   type        = 'other'              (placeholder — admin can edit)
   *   tenant_id   = tenant.id
   * The auto-NAS is identified by tenant_id + (description LIKE 'AUTO%' OR
   * existing row with matching nasname). Subsequent updates rewrite it.
   */
  private async syncTenantNas(tenant: Tenant): Promise<void> {
    if (!tenant.sstpIp || !tenant.sstpPassword) return; // can't auto-create without these

    // Find existing auto-NAS for this tenant
    const existing = await this.nasRepo.findOne({
      where: [
        { tenantId: tenant.id, nasname: tenant.sstpIp },
        { tenantId: tenant.id, description: 'AUTO' },
      ],
    });

    if (existing) {
      existing.nasname   = tenant.sstpIp;
      existing.shortname = tenant.name;
      existing.secret    = tenant.sstpPassword;
      if (!existing.type) existing.type = 'other';
      await this.nasRepo.save(existing);
    } else {
      const nas = this.nasRepo.create({
        nasname:    tenant.sstpIp,
        shortname:  tenant.name,
        type:       'other',
        secret:     tenant.sstpPassword,
        description: 'AUTO',
        tenantId:   tenant.id,
      });
      await this.nasRepo.save(nas);
    }
  }
}
