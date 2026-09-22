import { Module } from '@nestjs/common';
import { DocumentariesController } from './documentaries.controller';
import { DocumentariesService } from './documentaries.service';

@Module({
  controllers: [DocumentariesController],
  providers: [DocumentariesService],
  exports: [DocumentariesService],
})
export class DocumentariesModule {}
