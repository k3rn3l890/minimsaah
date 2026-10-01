"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const client_s3_1 = require("@aws-sdk/client-s3");
let MediaService = class MediaService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.s3 = null;
        this.r2Bucket = null;
        this.r2PublicUrl = null;
        const accountId = this.config.get('R2_ACCOUNT_ID');
        const accessKeyId = this.config.get('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY');
        this.r2Bucket = this.config.get('R2_BUCKET_NAME') || this.config.get('R2_BUCKET') || null;
        this.r2PublicUrl = this.config.get('R2_PUBLIC_URL') || null;
        if (accountId && accessKeyId && secretAccessKey && this.r2Bucket) {
            this.s3 = new client_s3_1.S3Client({
                region: 'auto',
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: { accessKeyId, secretAccessKey },
            });
        }
        this.uploadDir = path.join(process.cwd(), 'uploads');
        if (!this.s3 && !fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }
    isR2Enabled() {
        return !!this.s3 && !!this.r2Bucket;
    }
    async upload(file, uploaderId, dto) {
        if (!file) {
            throw new common_1.BadRequestException('No file provided');
        }
        const ext = path.extname(file.originalname);
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        let url;
        if (this.isR2Enabled()) {
            const buffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
            if (!buffer)
                throw new common_1.BadRequestException('File buffer missing');
            await this.s3.send(new client_s3_1.PutObjectCommand({
                Bucket: this.r2Bucket,
                Key: filename,
                Body: buffer,
                ContentType: file.mimetype,
            }));
            const publicBase = this.r2PublicUrl || this.config.get('R2_PUBLIC_URL', '');
            if (publicBase) {
                url = `${publicBase.replace(/\/$/, '')}/${filename}`;
            }
            else {
                const baseUrl = this.config.get('BASE_URL', 'http://localhost:3000');
                url = `${baseUrl}/uploads/${filename}`;
            }
            if (file.path && fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                }
                catch { }
            }
        }
        else {
            const filepath = path.join(this.uploadDir, filename);
            if (file.path && fs.existsSync(file.path)) {
                fs.renameSync(file.path, filepath);
            }
            else if (file.buffer) {
                fs.writeFileSync(filepath, file.buffer);
            }
            else {
                throw new common_1.BadRequestException('File buffer/path missing');
            }
            const baseUrl = this.config.get('BASE_URL', 'http://localhost:3000');
            url = `${baseUrl}/uploads/${filename}`;
        }
        let mediaType = dto?.type;
        if (!mediaType) {
            if (file.mimetype.startsWith('image/'))
                mediaType = 'IMAGE';
            else if (file.mimetype.startsWith('video/'))
                mediaType = 'VIDEO';
            else
                mediaType = 'DOCUMENT';
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
    async findAll(page = 1, limit = 20, type) {
        const skip = (page - 1) * limit;
        const where = {};
        if (type)
            where.type = type;
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
    async findOne(id) {
        const media = await this.prisma.media.findUnique({ where: { id } });
        if (!media)
            throw new common_1.NotFoundException('Media not found');
        return media;
    }
    async remove(id) {
        const media = await this.findOne(id);
        if (this.isR2Enabled()) {
            try {
                await this.s3.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.r2Bucket, Key: media.filename }));
            }
            catch { }
        }
        else {
            const filepath = path.join(this.uploadDir, media.filename);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }
        return this.prisma.media.delete({ where: { id } });
    }
    static getMulterConfig(_uploadDir) {
        if (process.env.R2_BUCKET_NAME || process.env.R2_BUCKET) {
            return {
                storage: require('multer').memoryStorage(),
                limits: { fileSize: 50 * 1024 * 1024 },
                fileFilter: (_req, file, cb) => {
                    const allowedMimes = [
                        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                        'video/mp4', 'video/webm', 'video/ogg',
                        'application/pdf',
                    ];
                    if (allowedMimes.includes(file.mimetype))
                        cb(null, true);
                    else
                        cb(new common_1.BadRequestException(`File type ${file.mimetype} not allowed`), false);
                },
            };
        }
        const uploadDir = _uploadDir || './uploads';
        return {
            storage: require('multer').diskStorage({
                destination: (_req, _file, cb) => {
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    cb(null, uploadDir);
                },
                filename: (_req, file, cb) => {
                    const ext = path.extname(file.originalname);
                    cb(null, `${(0, uuid_1.v4)()}${ext}`);
                },
            }),
            limits: { fileSize: 50 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                const allowedMimes = [
                    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                    'video/mp4', 'video/webm', 'video/ogg',
                    'application/pdf',
                ];
                if (allowedMimes.includes(file.mimetype))
                    cb(null, true);
                else
                    cb(new common_1.BadRequestException(`File type ${file.mimetype} not allowed`), false);
            },
        };
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], MediaService);
//# sourceMappingURL=media.service.js.map