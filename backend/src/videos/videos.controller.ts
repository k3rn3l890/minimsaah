import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(private videosService: VideosService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.VIDEOGRAPHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new video' })
  create(@Body() dto: CreateVideoDto, @CurrentUser('id') userId: string) {
    return this.videosService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List videos' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.videosService.findAll(
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit), 50) : 10,
    );
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured videos' })
  findFeatured() {
    return this.videosService.findFeatured();
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get video by ID or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.videosService.findOne(idOrSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.VIDEOGRAPHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a video' })
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
    return this.videosService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a video' })
  remove(@Param('id') id: string) {
    return this.videosService.remove(id);
  }
}
