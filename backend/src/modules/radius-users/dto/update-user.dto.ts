import { IsString, IsOptional, MinLength, IsNumber, IsDateString, Allow } from 'class-validator';

export class UpdateRadiusUserDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsNumber()
  planId?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsNumber()
  durationDays?: number;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
