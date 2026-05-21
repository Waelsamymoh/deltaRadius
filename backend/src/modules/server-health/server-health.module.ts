import { Module } from '@nestjs/common';
import { ServerHealthController } from './server-health.controller';
import { ServerHealthService } from './server-health.service';

@Module({
  controllers: [ServerHealthController],
  providers: [ServerHealthService],
})
export class ServerHealthModule {}
