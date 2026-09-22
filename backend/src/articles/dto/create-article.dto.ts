import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleCategory, ContentStatus } from '@prisma/client';

export class CreateArticleDto {
  @ApiProperty({ example: "Inside Ghana's Rise to Football Prominence" })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  excerpt?: string;

  @ApiProperty({ example: 'Full article body in HTML or Markdown...' })
  @IsString()
  body!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({ enum: ArticleCategory })
  @IsEnum(ArticleCategory)
  @IsOptional()
  category?: ArticleCategory;

  @ApiPropertyOptional({ example: ['football', 'ghana', 'academy'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  readingTime?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
