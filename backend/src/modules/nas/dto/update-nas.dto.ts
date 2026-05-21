import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * Updating an existing NAS only allows editing display fields. The IP
 * (nasname) and SSTP credentials are locked after creation — use a separate
 * "regenerate password" action to rotate credentials.
 */
export class UpdateNasDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shortname?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
