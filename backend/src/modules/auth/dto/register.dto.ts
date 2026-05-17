import { IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { AdminRole } from '../../../database/entities/admin-user.entity';

export class RegisterDto {
  @IsString()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  tenantId?: number;
}
