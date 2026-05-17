import { IsString, IsOptional, MinLength, IsNumber, IsDateString } from 'class-validator';

export class CreateRadiusUserDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsNumber()
  planId: number;

  @IsDateString()
  startDate: string;

  @IsNumber()
  durationDays: number;

  @IsString()
  firstName: string;

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
