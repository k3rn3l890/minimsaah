import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoCategory, ContentStatus } from '@prisma/client';

export class CreateVideoDto {
  @ApiProperty({ example: 'Making of a Pro: Behind the Scenes' })
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

  @ApiProperty({ example: 'https://youtube.com/watch?v=...' })
  @IsString()
  videoUrl!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  embedUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnail?: string;

  @ApiPropertyOptional({ example: 600 })
  @IsInt()
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ enum: VideoCategory })
  @IsEnum(VideoCategory)
  @IsOptional()
  category?: VideoCategory;

  @ApiPropertyOptional({ example: ['football', 'documentary'] })
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
