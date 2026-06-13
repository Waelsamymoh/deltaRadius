import { IsString, IsOptional, IsNumber, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  downloadMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  uploadMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionTimeoutMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  downloadLimitGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  uploadLimitGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalLimitGb?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  burstDownloadMbps?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  burstUploadMbps?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  burstThresholdDownloadMbps?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  burstThresholdUploadMbps?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  burstTimeSeconds?: number | null;

  @IsOptional()
  @IsString()
  framedPool?: string;

  @IsOptional()
  @IsString()
  quotaAction?: 'none' | 'disconnect' | 'switch';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fallbackPlanId?: number | null;
}
