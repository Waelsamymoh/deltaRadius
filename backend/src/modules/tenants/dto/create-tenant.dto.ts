import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  realm?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subdomain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sstpUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sstpPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  sstpIp?: string | null;

  /** If true, auto-generate SSTP username/password when none provided. Used by
   *  the owner's "Create network" flow; landing-page self-registration omits this. */
  @IsOptional()
  @IsBoolean()
  autoGenerateSstp?: boolean;
}
