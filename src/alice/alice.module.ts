import { Module } from '@nestjs/common';
import { ShoppingModule } from '../shopping/shopping.module';
import { AliceController } from './alice.controller';

@Module({
  imports: [ShoppingModule],
  controllers: [AliceController],
})
export class AliceModule {}
