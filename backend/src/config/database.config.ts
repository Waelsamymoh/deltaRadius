import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL || null,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  name: process.env.DB_NAME || 'radius',
  username: process.env.DB_USERNAME || 'radius_app',
  password: process.env.DB_PASSWORD || 'radius_app_pass',
}));
