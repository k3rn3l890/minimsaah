"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const config = app.get(config_1.ConfigService);
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    const corsOrigins = (config.get('CORS_ORIGIN', 'http://localhost:3000') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    app.enableCors({
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true);
            if (corsOrigins.includes(origin))
                return cb(null, true);
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
                return cb(null, true);
            if (corsOrigins.includes('*'))
                return cb(null, true);
            return cb(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const express = require('express');
    const path = require('path');
    if (!process.env.R2_BUCKET_NAME) {
        const uploadPath = path.join(process.cwd(), 'uploads');
        const altUploadPath = path.join(process.cwd(), '..', 'uploads');
        app.use('/uploads', express.static(uploadPath));
        try {
            app.use('/uploads', express.static(altUploadPath));
        }
        catch { }
    }
    const publicPath = path.join(process.cwd(), '..');
    app.use(express.static(publicPath, { index: false }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('MINIMSAAH Editorial API')
        .setDescription('REST API for the MINIMSAAH sports journalism platform. ' +
        'Manages articles, videos, documentaries, events, media assets, and user accounts.')
        .setVersion('1.0')
        .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
    }, 'access-token')
        .addTag('Auth', 'Registration, login, token refresh, and profile')
        .addTag('Users', 'User management (admin only)')
        .addTag('Articles', 'News articles, features, match reports')
        .addTag('Videos', 'Video stories and highlights')
        .addTag('Documentaries', 'Long-form documentary content')
        .addTag('Events', 'Upcoming events and promotions')
        .addTag('Ticker', 'Breaking news ticker headlines')
        .addTag('Media', 'File upload and media asset management')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = config.get('PORT', 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 MINIMSAAH API running on http://localhost:${port}`);
    console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map