import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';

export class CreateNasDto {
  @IsString()
  @MaxLength(128)
  nasname: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  shortname?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  ports?: number;

  @IsString()
  @MaxLength(60)
  secret: string;

  @IsOptional()
  @IsString()
  description?: string;
}
