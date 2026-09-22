import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Patch, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TickerService } from './ticker.service';
import { CreateTickerDto } from './dto/create-ticker.dto';
import { UpdateTickerDto } from './dto/update-ticker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Ticker')
@Controller('ticker')
export class TickerController {
  constructor(private tickerService: TickerService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a ticker headline' })
  create(@Body() dto: CreateTickerDto) {
    return this.tickerService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get active ticker headlines (public)' })
  findActive() {
    return this.tickerService.findActive();
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all ticker headlines (admin)' })
  findAll() {
    return this.tickerService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ticker by ID' })
  findOne(@Param('id') id: string) {
    return this.tickerService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a ticker headline' })
  update(@Param('id') id: string, @Body() dto: UpdateTickerDto) {
    return this.tickerService.update(id, dto);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle ticker active status' })
  toggle(@Param('id') id: string) {
    return this.tickerService.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.EDITOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a ticker headline' })
  remove(@Param('id') id: string) {
    return this.tickerService.remove(id);
  }
}
