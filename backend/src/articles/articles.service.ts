import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticleDto } from './dto/query-article.dto';

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async create(dto: CreateArticleDto, authorId: string) {
    const slug = dto.slug || this.slugify(dto.title);

    const existing = await this.prisma.article.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Article with this slug already exists');
    }

    return this.prisma.article.create({
      data: {
        title: dto.title,
        slug,
        excerpt: dto.excerpt,
        body: dto.body,
        coverImage: dto.coverImage,
        category: dto.category || 'FEATURE',
        tags: dto.tags || [],
        authorId,
        readingTime: dto.readingTime || Math.ceil(dto.body.split(' ').length / 200),
        featured: dto.featured || false,
        status: dto.status || 'DRAFT',
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  async findAll(query: QueryArticleDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 10, 50);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
        { body: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.authorId) where.authorId = query.authorId;

    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publishedAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(idOrSlug: string) {
    const article = await this.prisma.article.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, bio: true } },
      },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Increment view count
    await this.prisma.article.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
    });

    return article;
  }

  async update(id: string, dto: UpdateArticleDto) {
    await this.findOne(id);

    const data: any = { ...dto };
    if (dto.title && !dto.slug) {
      data.slug = this.slugify(dto.title);
    }

    return this.prisma.article.update({
      where: { id },
      data,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.article.delete({ where: { id } });
  }

  async findFeatured() {
    return this.prisma.article.findMany({
      where: { featured: true, status: 'PUBLISHED' },
      take: 5,
      orderBy: { publishedAt: 'desc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }
}
