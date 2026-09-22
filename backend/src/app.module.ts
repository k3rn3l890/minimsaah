import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ArticlesModule } from './articles/articles.module';
import { VideosModule } from './videos/videos.module';
import { DocumentariesModule } from './documentaries/documentaries.module';
import { EventsModule } from './events/events.module';
import { TickerModule } from './ticker/ticker.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ArticlesModule,
    VideosModule,
    DocumentariesModule,
    EventsModule,
    TickerModule,
    MediaModule,
  ],
})
export class AppModule {}
