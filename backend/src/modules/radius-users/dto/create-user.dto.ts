import { IsString, IsOptional, MinLength, IsNumber, IsDateString, IsIn } from 'class-validator';

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

  /** Free-text organisational label for grouping/filtering subscribers. */
  @IsOptional()
  @IsString()
  groupName?: string;

  /** Initial consumption in GB to carry over from another system.
   *  Adds to the new subscriber's counter at creation time. */
  @IsOptional()
  @IsNumber()
  initialUsageGb?: number;

  /** Self-service portal password — subscriber logs in with mobile + this. */
  @IsOptional()
  @IsString()
  portalPassword?: string;

  /** Connection type on the MikroTik: hotspot or broadband (PPPoE). */
  @IsOptional()
  @IsIn(['hotspot', 'broadband'])
  connectionType?: 'hotspot' | 'broadband';
}
