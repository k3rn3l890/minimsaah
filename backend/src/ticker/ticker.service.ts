import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTickerDto } from './dto/create-ticker.dto';
import { UpdateTickerDto } from './dto/update-ticker.dto';

@Injectable()
export class TickerService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTickerDto) {
    return this.prisma.ticker.create({
      data: {
        text: dto.text,
        link: dto.link,
        priority: dto.priority || 0,
        active: dto.active !== undefined ? dto.active : true,
      },
    });
  }

  async findAll() {
    return this.prisma.ticker.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findActive() {
    return this.prisma.ticker.findMany({
      where: { active: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, text: true, link: true },
    });
  }

  async findOne(id: string) {
    const ticker = await this.prisma.ticker.findUnique({ where: { id } });
    if (!ticker) throw new NotFoundException('Ticker not found');
    return ticker;
  }

  async update(id: string, dto: UpdateTickerDto) {
    await this.findOne(id);
    return this.prisma.ticker.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ticker.delete({ where: { id } });
  }

  async toggleActive(id: string) {
    const ticker = await this.findOne(id);
    return this.prisma.ticker.update({
      where: { id },
      data: { active: !ticker.active },
    });
  }
}
