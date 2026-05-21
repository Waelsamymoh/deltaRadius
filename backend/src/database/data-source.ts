import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Tenant } from './entities/tenant.entity';
import { Nas } from './entities/nas.entity';
import { RadCheck } from './entities/radcheck.entity';
import { RadReply } from './entities/radreply.entity';
import { RadGroupCheck } from './entities/radgroupcheck.entity';
import { RadGroupReply } from './entities/radgroupreply.entity';
import { RadUserGroup } from './entities/radusergroup.entity';
import { RadAcct } from './entities/radacct.entity';
import { RadPostAuth } from './entities/radpostauth.entity';
import { AdminUser } from './entities/admin-user.entity';

dotenv.config();

const url = process.env.DATABASE_URL;

// Used by TypeORM CLI for migrations (runs as radius user with BYPASSRLS)
export const AppDataSource = new DataSource(
  url
    ? {
        type: 'postgres',
        url,
        ssl: { rejectUnauthorized: false },
        synchronize: false,
        logging: false,
        entities: [Tenant, Nas, RadCheck, RadReply, RadGroupCheck, RadGroupReply, RadUserGroup, RadAcct, RadPostAuth, AdminUser],
        migrations: ['src/database/migrations/*.ts'],
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'radius',
        username: process.env.DB_RADIUS_USERNAME || 'radius',
        password: process.env.DB_RADIUS_PASSWORD || 'radpass',
        synchronize: false,
        logging: false,
        entities: [Tenant, Nas, RadCheck, RadReply, RadGroupCheck, RadGroupReply, RadUserGroup, RadAcct, RadPostAuth, AdminUser],
        migrations: ['src/database/migrations/*.ts'],
      },
);
