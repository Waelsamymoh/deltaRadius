import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, DataSource } from 'typeorm';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Nas } from '../../database/entities/nas.entity';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { CreateNasDto } from './dto/create-nas.dto';
import { UpdateNasDto } from './dto/update-nas.dto';
import { getTenantId } from '../../common/helpers/tenant.helper';

const execAsync = promisify(exec);

@Injectable()
export class NasService {
  constructor(
    @InjectRepository(Nas)
    private readonly nasRepo: Repository<Nas>,
    private readonly dataSource: DataSource,
  ) {}

  private where(user: AdminUser, extra: Partial<Nas> = {}): FindOptionsWhere<Nas> {
    const tenantId = getTenantId(user);
    return tenantId ? { tenantId, ...extra } as FindOptionsWhere<Nas> : extra as FindOptionsWhere<Nas>;
  }

  private async reloadRadius(): Promise<void> {
    try {
      await execAsync('systemctl restart freeradius');
    } catch { /* non-fatal */ }
  }

  findAll(user: AdminUser) {
    return this.nasRepo.find({ where: this.where(user), order: { nasname: 'ASC' } });
  }

  async findOne(id: number, user: AdminUser) {
    const nas = await this.nasRepo.findOne({ where: this.where(user, { id }) });
    if (!nas) throw new NotFoundException(`NAS ${id} not found`);
    return nas;
  }

  async create(dto: CreateNasDto, user: AdminUser) {
    const existing = await this.nasRepo.findOne({ where: { nasname: dto.nasname } });
    if (existing) throw new ConflictException(`عنوان IP "${dto.nasname}" مضاف مسبقاً`);

    const tenantId = getTenantId(user);
    const nas = this.nasRepo.create({ ...dto, tenantId: tenantId ?? undefined });
    const saved = await this.nasRepo.save(nas);
    await this.reloadRadius();
    return saved;
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
    await this.nasRepo.remove(nas);
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

    const rows = await this.dataSource.query(
      `SELECT
         MAX(acctstarttime)                                    AS last_seen,
         COUNT(*)                                              AS total_sessions,
         COUNT(*) FILTER (WHERE acctstoptime IS NULL)          AS active_sessions
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
