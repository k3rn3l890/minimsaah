import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async create(dto: CreateEventDto, authorId: string) {
    const slug = dto.slug || this.slugify(dto.title);
    const existing = await this.prisma.event.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Event with this slug already exists');

    return this.prisma.event.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        coverImage: dto.coverImage,
        date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        location: dto.location,
        venue: dto.venue,
        ticketUrl: dto.ticketUrl,
        tags: dto.tags || [],
        authorId,
        status: dto.status || 'DRAFT',
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async findAll(page = 1, limit = 10, upcoming = false) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (upcoming) where.date = { gte: new Date() };

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'asc' },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(idOrSlug: string) {
    const event = await this.prisma.event.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.title && !dto.slug) data.slug = this.slugify(dto.title);
    if (dto.date) data.date = new Date(dto.date);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.event.update({
      where: { id },
      data,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.event.delete({ where: { id } });
  }

  async findUpcoming() {
    return this.prisma.event.findMany({
      where: { date: { gte: new Date() }, status: 'PUBLISHED' },
      take: 5,
      orderBy: { date: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }
}
