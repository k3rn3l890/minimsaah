import { IsString, IsOptional, IsArray, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentStatus } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ example: 'Accra Football Summit 2026' })
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

  @ApiProperty({ example: '2026-09-15T09:00:00Z' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Accra, Ghana' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 'National Stadium' })
  @IsString()
  @IsOptional()
  venue?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ticketUrl?: string;

  @ApiPropertyOptional({ example: ['football', 'summit', 'networking'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsEnum(ContentStatus)
  @IsOptional()
  status?: ContentStatus;
}
