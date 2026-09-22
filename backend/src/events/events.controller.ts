import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new event' })
  create(@Body() dto: CreateEventDto, @CurrentUser('id') userId: string) {
    return this.eventsService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List events' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('upcoming') upcoming?: string,
  ) {
    return this.eventsService.findAll(
      page ? parseInt(page) : 1,
      limit ? Math.min(parseInt(limit), 50) : 10,
      upcoming === 'true',
    );
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming events' })
  findUpcoming() {
    return this.eventsService.findUpcoming();
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get event by ID or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.eventsService.findOne(idOrSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an event' })
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an event' })
  remove(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}
