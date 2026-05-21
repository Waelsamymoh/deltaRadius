import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateNasDto {
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
