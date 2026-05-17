import { PartialType } from '@nestjs/mapped-types';
import { CreateNasDto } from './create-nas.dto';

export class UpdateNasDto extends PartialType(CreateNasDto) {}
