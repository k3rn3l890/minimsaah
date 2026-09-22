import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DocumentariesService } from './documentaries.service';
import { CreateDocumentaryDto } from './dto/create-documentary.dto';
import { UpdateDocumentaryDto } from './dto/update-documentary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Documentaries')
@Controller('documentaries')
export class DocumentariesController {
  constructor(private documentariesService: DocumentariesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.VIDEOGRAPHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new documentary' })
  create(@Body() dto: CreateDocumentaryDto, @CurrentUser('id') userId: string) {
    return this.documentariesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List documentaries' })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.documentariesService.findAll(
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit), 50) : 10,
    );
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured documentaries' })
  findFeatured() {
    return this.documentariesService.findFeatured();
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get documentary by ID or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.documentariesService.findOne(idOrSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR, Role.VIDEOGRAPHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a documentary' })
  update(@Param('id') id: string, @Body() dto: UpdateDocumentaryDto) {
    return this.documentariesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a documentary' })
  remove(@Param('id') id: string) {
    return this.documentariesService.remove(id);
  }
}
