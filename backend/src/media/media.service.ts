import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MediaType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
  private s3: S3Client | null = null;
  private r2Bucket: string | null = null;
  private r2PublicUrl: string | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // R2 config (free persistent storage via Cloudflare)
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.r2Bucket = this.config.get<string>('R2_BUCKET_NAME') || this.config.get<string>('R2_BUCKET') || null;
    this.r2PublicUrl = this.config.get<string>('R2_PUBLIC_URL') || null;

    if (accountId && accessKeyId && secretAccessKey && this.r2Bucket) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }

    // Fallback local dir for localhost when R2 not configured
    this.uploadDir = path.join(process.cwd(), 'uploads');
    if (!this.s3 && !fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private isR2Enabled(): boolean {
    return !!this.s3 && !!this.r2Bucket;
  }

  async upload(file: MulterFile, uploaderId: string, dto?: { alt?: string; caption?: string; type?: MediaType }) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;

    let url: string;

    if (this.isR2Enabled()) {
      // Persistent R2 upload (free 10GB, zero egress via pub-xxx.r2.dev)
      const buffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
      if (!buffer) throw new BadRequestException('File buffer missing');

      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.r2Bucket!,
          Key: filename,
          Body: buffer,
          ContentType: file.mimetype,
        }),
      );

      const publicBase = this.r2PublicUrl || this.config.get<string>('R2_PUBLIC_URL', '');
      if (publicBase) {
        url = `${publicBase.replace(/\/$/, '')}/${filename}`;
      } else {
        // fallback to BASE_URL if no public URL configured
        const baseUrl = this.config.get('BASE_URL', 'http://localhost:3000');
        url = `${baseUrl}/uploads/${filename}`;
      }

      // cleanup temp disk file if present
      if (file.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch {}
      }
    } else {
      // Local fallback (localhost) — will be wiped on Render sleep, but works for dev
      const filepath = path.join(this.uploadDir, filename);
      if (file.path && fs.existsSync(file.path)) {
        fs.renameSync(file.path, filepath);
      } else if (file.buffer) {
        fs.writeFileSync(filepath, file.buffer);
      } else {
        throw new BadRequestException('File buffer/path missing');
      }

      const baseUrl = this.config.get('BASE_URL', 'http://localhost:3000');
      url = `${baseUrl}/uploads/${filename}`;
    }

    // Determine media type from mimetype if not provided
    let mediaType = dto?.type;
    if (!mediaType) {
      if (file.mimetype.startsWith('image/')) mediaType = 'IMAGE';
      else if (file.mimetype.startsWith('video/')) mediaType = 'VIDEO';
      else mediaType = 'DOCUMENT';
    }

    const media = await this.prisma.media.create({
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
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

    if (this.isR2Enabled()) {
      try {
        await this.s3!.send(new DeleteObjectCommand({ Bucket: this.r2Bucket!, Key: media.filename }));
      } catch {}
    } else {
      const filepath = path.join(this.uploadDir, media.filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }

    return this.prisma.media.delete({ where: { id } });
  }

  // Multer configuration — memoryStorage when R2 enabled (persistent), disk fallback for localhost
  static getMulterConfig(_uploadDir?: string) {
    if (process.env.R2_BUCKET_NAME || process.env.R2_BUCKET) {
      return {
        storage: require('multer').memoryStorage(),
        limits: { fileSize: 50 * 1024 * 1024 },
        fileFilter: (_req: any, file: any, cb: any) => {
          const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/ogg',
            'application/pdf',
          ];
          if (allowedMimes.includes(file.mimetype)) cb(null, true);
          else cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
        },
      };
    }
    // localhost fallback
    const uploadDir = _uploadDir || './uploads';
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
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) => {
        const allowedMimes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
          'video/mp4', 'video/webm', 'video/ogg',
          'application/pdf',
        ];
        if (allowedMimes.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`File type ${file.mimetype} not allowed`), false);
      },
    };
  }
}
