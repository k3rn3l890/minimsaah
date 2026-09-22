import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentaryDto } from './dto/create-documentary.dto';
import { UpdateDocumentaryDto } from './dto/update-documentary.dto';
import { buildEmbed } from '../common/video-embed.util';

@Injectable()
export class DocumentariesService {
  constructor(private prisma: PrismaService) {}

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async create(dto: CreateDocumentaryDto, authorId: string) {
    const slug = dto.slug || this.slugify(dto.title);
    const existing = await this.prisma.documentary.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Documentary with this slug already exists');

    let embedUrl = dto.embedUrl || null;
    // Auto embed for docs too (YouTube/TikTok/FB/IG)
    if (dto.videoUrl && !embedUrl) {
      const res = await buildEmbed(dto.videoUrl, dto.coverImage || null);
      if (res.embedUrl) embedUrl = res.embedUrl;
      // if coverImage missing, use thumbnail as cover
      if (!dto.coverImage && res.thumbnail) dto.coverImage = res.thumbnail;
    }

    return this.prisma.documentary.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        coverImage: dto.coverImage,
        videoUrl: dto.videoUrl,
        embedUrl: embedUrl || undefined,
        duration: dto.duration,
        chapters: dto.chapters || undefined,
        tags: dto.tags || [],
        authorId,
        featured: dto.featured || false,
        status: dto.status || 'DRAFT',
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.documentary.findMany({
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.documentary.count(),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(idOrSlug: string) {
    const doc = await this.prisma.documentary.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!doc) throw new NotFoundException('Documentary not found');
    await this.prisma.documentary.update({ where: { id: doc.id }, data: { viewCount: { increment: 1 } } });
    return doc;
  }

  async update(id: string, dto: UpdateDocumentaryDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.title && !dto.slug) data.slug = this.slugify(dto.title);
    if (dto.videoUrl && !dto.embedUrl) {
      const res = await buildEmbed(dto.videoUrl, dto.coverImage || null);
      if (res.embedUrl) data.embedUrl = res.embedUrl;
      if (!dto.coverImage && res.thumbnail) data.coverImage = res.thumbnail;
    }
    return this.prisma.documentary.update({
      where: { id },
      data,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.documentary.delete({ where: { id } });
  }

  async findFeatured() {
    return this.prisma.documentary.findMany({
      where: { featured: true, status: 'PUBLISHED' },
      take: 6,
      orderBy: { publishedAt: 'desc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }
}
