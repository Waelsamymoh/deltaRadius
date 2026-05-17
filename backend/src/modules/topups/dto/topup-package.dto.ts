import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTopupPackageDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  sizeGb: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTopupPackageDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) sizeGb?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() description?: string;
}

export class ApplyTopupDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageId: number;
}
