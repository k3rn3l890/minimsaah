import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MediaType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Injectable()
export class MediaService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(file: MulterFile, uploaderId: string, dto?: { alt?: string; caption?: string; type?: MediaType }) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Generate unique filename
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(this.uploadDir, filename);

    // Move file from temp to uploads
    fs.renameSync(file.path, filepath);

    // Determine media type from mimetype if not provided
    let mediaType = dto?.type;
    if (!mediaType) {
      if (file.mimetype.startsWith('image/')) mediaType = 'IMAGE';
      else if (file.mimetype.startsWith('video/')) mediaType = 'VIDEO';
      else mediaType = 'DOCUMENT';
    }

    const baseUrl = this.config.get('BASE_URL', 'http://localhost:3000');

    const media = await this.prisma.media.create({
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `${baseUrl}/uploads/${filename}`,
        alt: dto?.alt,
        caption: dto?.caption,
        type: mediaType,
        uploaderId,
      },
    });

    return media;
  }

  async findAll(page = 1, limit = 20, type?: MediaType) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (type) where.type = type;

    const [items, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.media.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  async remove(id: string) {
    const media = await this.findOne(id);

    // Delete physical file
    const filepath = path.join(this.uploadDir, media.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    return this.prisma.media.delete({ where: { id } });
  }

  // Multer configuration
  static getMulterConfig(uploadDir: string) {
    return {
      storage: require('multer').diskStorage({
        destination: (_req: any, _file: any, cb: any) => {
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (_req: any, file: any, cb: any) => {
          const ext = path.extname(file.originalname);
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
      fileFilter: (_req: any, file: any, cb: any) => {
        const allowedMimes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          'video/mp4', 'video/webm', 'video/ogg',
          'application/pdf',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
        }
      },
    };
  }
}
