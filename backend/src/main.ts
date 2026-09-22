import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS — allow localhost file:// + live domains (comma-separated in .env)
  const corsOrigins = (config.get('CORS_ORIGIN', 'http://localhost:3000') || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // allow no-origin (file://, curl, mobile) + listed origins + any localhost
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return cb(null, true);
      // allow any origin in dev if CORS_ORIGIN contains "*"
      if (corsOrigins.includes('*')) return cb(null, true);
      // default allow for localhost dev (permissive)
      return cb(null, true);
    },
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Serve uploaded files statically — keep all files inside minimsaah_v1/backend/uploads
  const express = require('express');
  const path = require('path');
  const uploadPath = path.join(process.cwd(), 'uploads');
  // also support running from minimsaah_v1 root: minimsaah_v1/uploads
  const altUploadPath = path.join(process.cwd(), '..', 'uploads');
  app.use('/uploads', express.static(uploadPath));
  // legacy fallback
  try { app.use('/uploads', express.static(altUploadPath)); } catch {}
  // also serve public site statically when backend serves frontend (optional)
  const publicPath = path.join(process.cwd(), '..');
  app.use(express.static(publicPath, { index: false }));

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MINIMSAAH Editorial API')
    .setDescription(
      'REST API for the MINIMSAAH sports journalism platform. ' +
      'Manages articles, videos, documentaries, events, media assets, and user accounts.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
      },
      'access-token',
    )
    .addTag('Auth', 'Registration, login, token refresh, and profile')
    .addTag('Users', 'User management (admin only)')
    .addTag('Articles', 'News articles, features, match reports')
    .addTag('Videos', 'Video stories and highlights')
    .addTag('Documentaries', 'Long-form documentary content')
    .addTag('Events', 'Upcoming events and promotions')
    .addTag('Ticker', 'Breaking news ticker headlines')
    .addTag('Media', 'File upload and media asset management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 MINIMSAAH API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
