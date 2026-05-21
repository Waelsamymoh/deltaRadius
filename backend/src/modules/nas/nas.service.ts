import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Nas } from '../../database/entities/nas.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { CreateNasDto } from './dto/create-nas.dto';
import { UpdateNasDto } from './dto/update-nas.dto';
import { getTenantId } from '../../common/helpers/tenant.helper';
import { TenantsService } from '../tenants/tenants.service';

const execAsync = promisify(exec);

@Injectable()
export class NasService {
  constructor(
    @InjectRepository(Nas)
    private readonly nasRepo: Repository<Nas>,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly config: ConfigService,
  ) {}

  /** Per-NAS download token: derived from nasId + JWT_SECRET + the SSTP password.
   *  Rotating the password (regenerate) automatically invalidates old tokens. */
  scriptToken(nas: Nas): string {
    const appSecret = this.config.get<string>('JWT_SECRET') || 'change_me_in_production';
    return crypto
      .createHmac('sha256', appSecret)
      .update(`nas:${nas.id}:${nas.secret ?? ''}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** Look up a NAS by id and verify the download token matches. Used by the
   *  public, no-auth /api/public/nas/:id/script.rsc endpoint. */
  async findByIdWithToken(id: number, token: string): Promise<Nas> {
    const nas = await this.nasRepo.findOne({ where: { id } });
    if (!nas) throw new NotFoundException(`NAS ${id} not found`);
    const expected = this.scriptToken(nas);
    if (!token || token.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      throw new ForbiddenException('invalid token');
    }
    return nas;
  }

  /** Build the fully-qualified URL + the one-liner /tool fetch command for MikroTik.
   *  Token is encoded in the URL PATH (not query string) because MikroTik's
   *  /tool fetch strips the "?" character from URLs. */
  buildFetchCommand(nas: Nas, baseUrl: string): { url: string; command: string } {
    const token = this.scriptToken(nas);
    const url = `${baseUrl.replace(/\/$/, '')}/api/public/nas/${nas.id}/${token}/script.rsc`;
    const command =
      `/tool fetch url="${url}" mode=https dst-path=delta.rsc; ` +
      `:delay 2s; ` +
      `/import file-name=delta.rsc; ` +
      `/file remove [find name=delta.rsc]`;
    return { url, command };
  }

  private where(user: AdminUser, extra: Partial<Nas> = {}): FindOptionsWhere<Nas> {
    const tenantId = getTenantId(user);
    return tenantId ? { tenantId, ...extra } as FindOptionsWhere<Nas> : extra as FindOptionsWhere<Nas>;
  }

  private async reloadRadius(): Promise<void> {
    try {
      await execAsync('systemctl restart freeradius');
    } catch { /* non-fatal */ }
  }

  /** Enrich a NAS row with its paired SSTP username (looked up by IP in chap-secrets). */
  private enrich(nas: Nas) {
    const sstpUsername = nas.nasname ? this.tenantsService.findChapUsernameByIp(nas.nasname) : null;
    return { ...nas, sstpUsername, sstpIp: nas.nasname };
  }

  async findAll(user: AdminUser) {
    const rows = await this.nasRepo.find({ where: this.where(user), order: { nasname: 'ASC' } });
    return rows.map(n => this.enrich(n));
  }

  async findOne(id: number, user: AdminUser) {
    const nas = await this.nasRepo.findOne({ where: this.where(user, { id }) });
    if (!nas) throw new NotFoundException(`NAS ${id} not found`);
    return nas;
  }

  /** Build a MikroTik RouterOS script that wires this NAS into DeltaRadius.
   *  Each command is a SINGLE line (no backslash line-continuations) — some
   *  RouterOS versions choke on multi-line commands when pasted into terminal. */
  buildMikrotikScript(nas: Nas): string {
    const username = nas.nasname ? this.tenantsService.findChapUsernameByIp(nas.nasname) : null;
    if (!username || !nas.secret || !nas.nasname) {
      throw new BadRequestException('بيانات SSTP غير مكتملة لهذا الجهاز');
    }
    const commands = [
      `/interface sstp-client add name=delta-sstp connect-to=sstp2.delta-group.online:442 user="${username}" password="${nas.secret}" authentication=mschap2,mschap1 profile=default-encryption add-default-route=no disabled=no`,
      `/radius add address=196.88.0.1 secret="${nas.secret}" service=ppp,hotspot,wireless src-address=${nas.nasname} timeout=3s`,
      `/radius incoming set accept=yes port=3799`,
      `/ppp aaa set interim-update=10s use-circuit-id-in-nas-port-id=yes use-radius=yes`,
      `/ip hotspot profile set hsprof1 radius-interim-update=10s use-radius=yes`,
    ];
    return commands.join('; ') + '\n';
  }

  async create(dto: CreateNasDto, user: AdminUser) {
    // 1. Auto-generate a unique SSTP username + password (no user input).
    //    Username uses a fixed "nas" prefix + random suffix — independent of any
    //    field the user typed (shortname, description, etc.) so it's truly random.
    const username = await this.tenantsService.generateRandomSstpUsername();
    const password = this.tenantsService.generateSstpPassword();

    // 2. Allocate the next free static IP from the SSTP pool
    const ip = await this.tenantsService.allocateStaticIpPublic();

    // 3. Register the SSTP user in /etc/ppp/chap-secrets with the static IP
    this.tenantsService.upsertChapEntry(username, password, ip);

    // 4. Create the NAS row — nasname = the allocated IP, secret = the password
    const tenantId = getTenantId(user);
    const nas = this.nasRepo.create({
      nasname:      ip,
      shortname:    dto.shortname ?? username,
      type:         dto.type ?? 'mikrotik',
      secret:       password,
      description:  dto.description,
      tenantId:     tenantId ?? undefined,
      sstpUsername: username,
    });

    let saved: Nas;
    try {
      saved = await this.nasRepo.save(nas);
    } catch (e) {
      // Roll back chap-secrets if the NAS insert fails
      this.tenantsService.removeChapEntry(username);
      throw e;
    }
    await this.reloadRadius();
    // Return the generated credentials so the UI can show them once.
    return { ...saved, sstpUsername: username, sstpPassword: password, sstpIp: ip };
  }

  async update(id: number, dto: UpdateNasDto, user: AdminUser) {
    const nas = await this.findOne(id, user);
    Object.assign(nas, dto);
    const saved = await this.nasRepo.save(nas);
    await this.reloadRadius();
    return saved;
  }

  async remove(id: number, user: AdminUser) {
    const nas = await this.findOne(id, user);
    // Skip cleanup for tenant auto-NAS — that SSTP user belongs to the tenant,
    // not to this standalone NAS row. Tenant's own SSTP stays until tenant is deleted.
    const isTenantAutoNas = nas.description === 'AUTO';
    await this.nasRepo.remove(nas);
    if (!isTenantAutoNas && nas.nasname) {
      const username = nas.sstpUsername || this.tenantsService.findChapUsernameByIp(nas.nasname);
      if (username) this.tenantsService.removeChapEntry(username);
    }
    await this.reloadRadius();
    return { message: `NAS ${id} deleted` };
  }

  async checkRadius(id: number, user: AdminUser) {
    const nas = await this.findOne(id, user);
    const ip = nas.nasname;

    let radiusRunning = false;
    try {
      const { stdout } = await execAsync('systemctl is-active freeradius');
      radiusRunning = stdout.trim() === 'active';
    } catch { /* not running */ }

    if (!radiusRunning) {
      return {
        connected: false,
        activeSessions: 0,
        totalSessions: 0,
        lastSeen: null,
        status: 'خادم RADIUS غير مشغّل',
        radiusRunning: false,
        clientRegistered: false,
      };
    }

    // "Active" = no Acct-Stop AND recent interim update — stuck sessions don't count.
    const rows = await this.dataSource.query(
      `SELECT
         MAX(acctstarttime)                                    AS last_seen,
         COUNT(*)                                              AS total_sessions,
         COUNT(*) FILTER (
           WHERE acctstoptime IS NULL
             AND (
               acctupdatetime > NOW() - INTERVAL '10 minutes'
               OR (acctupdatetime IS NULL AND acctstarttime > NOW() - INTERVAL '10 minutes')
             )
         ) AS active_sessions
       FROM radacct
       WHERE nasipaddress = $1::inet`,
      [ip],
    );

    const row = rows[0];
    const lastSeen: Date | null = row?.last_seen ?? null;
    const activeSessions = parseInt(row?.active_sessions ?? '0');
    const totalSessions = parseInt(row?.total_sessions ?? '0');
    const connected = lastSeen !== null;

    let status: string;
    if (!connected) {
      status = 'مسجّل في RADIUS — في انتظار أول اتصال';
    } else {
      const diff = Date.now() - new Date(lastSeen).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours   = Math.floor(minutes / 60);
      const days    = Math.floor(hours / 24);
      const ago = days > 0 ? `منذ ${days} يوم`
        : hours > 0 ? `منذ ${hours} ساعة`
        : minutes > 0 ? `منذ ${minutes} دقيقة`
        : 'الآن';
      status = `آخر اتصال: ${ago}`;
    }

    return {
      connected,
      activeSessions,
      totalSessions,
      lastSeen,
      status,
      radiusRunning: true,
      clientRegistered: true,
    };
  }
}
