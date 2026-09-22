import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType } from '@prisma/client';

export class UploadMediaDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  alt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  caption?: string;

  @ApiPropertyOptional({ enum: MediaType })
  @IsEnum(MediaType)
  @IsOptional()
  type?: MediaType;
}
