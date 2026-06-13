import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { PermissionsMiddleware } from './common/middleware/permissions.middleware';
import { TenantSubdomainMiddleware } from './common/middleware/tenant-subdomain.middleware';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { RadiusUsersModule } from './modules/radius-users/radius-users.module';
import { NasModule } from './modules/nas/nas.module';
import { GroupsModule } from './modules/groups/groups.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { PlansModule } from './modules/plans/plans.module';
import { SstpModule } from './modules/sstp/sstp.module';
import { QuotaModule } from './modules/quota/quota.module';
import { VoucherCardsModule } from './modules/voucher-cards/voucher-cards.module';
import { TopupsModule } from './modules/topups/topups.module';
import { OwnerAssistantsModule } from './modules/owner-assistants/owner-assistants.module';
import { TenantAssistantsModule } from './modules/tenant-assistants/tenant-assistants.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SalesReceiptsModule } from './modules/sales-receipts/sales-receipts.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { SubscriberPortalModule } from './modules/subscriber-portal/subscriber-portal.module';
import { ServerHealthModule } from './modules/server-health/server-health.module';
import { BackupModule } from './modules/backup/backup.module';
import { ModemsModule } from './modules/modems/modems.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    DatabaseModule,
    AuthModule,
    TenantsModule,
    RadiusUsersModule,
    NasModule,
    GroupsModule,
    AccountingModule,
    PlansModule,
    SstpModule,
    QuotaModule,
    VoucherCardsModule,
    TopupsModule,
    OwnerAssistantsModule,
    TenantAssistantsModule,
    ReportsModule,
    SalesReceiptsModule,
    AuditLogsModule,
    SubscriberPortalModule,
    ServerHealthModule,
    BackupModule,
    ModemsModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true }) },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    TenantSubdomainMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve tenant from subdomain header before any route handler
    consumer.apply(TenantSubdomainMiddleware).forRoutes('*');
    consumer.apply(PermissionsMiddleware).forRoutes('*');
  }
}
