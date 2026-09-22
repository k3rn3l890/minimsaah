import { IsString, IsOptional, IsArray, IsBoolean, IsInt, IsJSON, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';

export class CreateDocumentaryDto {
  @ApiProperty({ example: 'The Academy Pipeline: Where Champions Are Made' })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  embedUrl?: string;

  @ApiPropertyOptional({ example: 2400 })
  @IsInt()
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ example: [{ title: 'Introduction', startTime: 0 }, { title: 'The Journey', startTime: 120 }] })
  @IsOptional()
  chapters?: any;

  @ApiPropertyOptional({ example: ['documentary', 'football', 'ghana'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
