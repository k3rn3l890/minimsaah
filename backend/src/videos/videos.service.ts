import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { buildEmbed } from '../common/video-embed.util';

@Injectable()
export class VideosService {
  constructor(private prisma: PrismaService) {}

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  private parseDuration(duration?: number): string | null {
    if (!duration) return null;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async create(dto: CreateVideoDto, authorId: string) {
    const slug = dto.slug || this.slugify(dto.title);
    const existing = await this.prisma.video.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Video with this slug already exists');

    // Auto-build embedUrl + thumbnail for YouTube/TikTok/Facebook/Instagram if not provided
    let embedUrl = dto.embedUrl || null;
    let thumbnail = dto.thumbnail || null;
    if (dto.videoUrl && (!embedUrl || !thumbnail)) {
      const res = await buildEmbed(dto.videoUrl, thumbnail);
      if (!embedUrl && res.embedUrl) embedUrl = res.embedUrl;
      if (!thumbnail && res.thumbnail) thumbnail = res.thumbnail;
    }

    return this.prisma.video.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        videoUrl: dto.videoUrl,
        embedUrl: embedUrl || undefined,
        thumbnail: thumbnail || undefined,
        duration: dto.duration,
        category: dto.category || 'HIGHLIGHT',
        tags: dto.tags || [],
        authorId,
        featured: dto.featured || false,
        status: dto.status || 'DRAFT',
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async findAll(page = 1, limit = 10, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.video.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(idOrSlug: string) {
    const video = await this.prisma.video.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');

    await this.prisma.video.update({ where: { id: video.id }, data: { viewCount: { increment: 1 } } });
    return video;
  }

  async update(id: string, dto: UpdateVideoDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.title && !dto.slug) data.slug = this.slugify(dto.title);

    // Re-derive embed/thumbnail if videoUrl changed and embed not manually set
    if (dto.videoUrl) {
      const res = await buildEmbed(dto.videoUrl, dto.thumbnail || null);
      if (!dto.embedUrl && res.embedUrl) data.embedUrl = res.embedUrl;
      if (!dto.thumbnail && res.thumbnail) data.thumbnail = res.thumbnail;
    }

    return this.prisma.video.update({
      where: { id },
      data,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.video.delete({ where: { id } });
  }

  async findFeatured() {
    return this.prisma.video.findMany({
      where: { featured: true, status: 'PUBLISHED' },
      take: 6,
      orderBy: { publishedAt: 'desc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }
}
