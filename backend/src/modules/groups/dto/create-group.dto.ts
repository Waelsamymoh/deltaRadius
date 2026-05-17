import { IsString, IsOptional } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  groupName: string;

  @IsOptional()
  checks?: { attribute: string; op: string; value: string }[];

  @IsOptional()
  replies?: { attribute: string; op: string; value: string }[];
}
