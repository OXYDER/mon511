import { Module } from '@nestjs/common';
import { ProblemTypesController } from './problem-types.controller';
import { ProblemTypesService } from './problem-types.service';

@Module({
  controllers: [ProblemTypesController],
  providers: [ProblemTypesService],
  exports: [ProblemTypesService],
})
export class ProblemTypesModule {}
