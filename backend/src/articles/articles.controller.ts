import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticleDto } from './dto/query-article.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.JOURNALIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new article' })
  create(@Body() dto: CreateArticleDto, @CurrentUser('id') userId: string) {
    return this.articlesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List articles with filtering and pagination' })
  findAll(@Query() query: QueryArticleDto) {
    return this.articlesService.findAll(query);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured articles' })
  findFeatured() {
    return this.articlesService.findFeatured();
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get article by ID or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.articlesService.findOne(idOrSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.JOURNALIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an article' })
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an article' })
  remove(@Param('id') id: string) {
    return this.articlesService.remove(id);
  }
}
