import { IsString, IsOptional, MinLength, IsNumber, IsDateString, Allow, IsIn } from 'class-validator';

export class UpdateRadiusUserDto {
  /** Rename the subscriber. Triggers an atomic cascade across all RADIUS
   *  tables (radcheck/radreply/radusergroup/radacct/radpostauth) plus our
   *  own profile/usage/topup tables. */
  @IsOptional()
  @IsString()
  newUsername?: string;

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

  /** Free-text organisational label for grouping/filtering subscribers. */
  @IsOptional()
  @IsString()
  groupName?: string;

  /** Self-service portal password — set/reset by the manager. */
  @IsOptional()
  @IsString()
  portalPassword?: string;

  @IsOptional()
  @IsIn(['hotspot', 'broadband'])
  connectionType?: 'hotspot' | 'broadband';
}
