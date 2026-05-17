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
  @IsBoolean()
  isActive?: boolean;
}
