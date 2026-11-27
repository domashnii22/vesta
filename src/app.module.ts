import { Module } from '@nestjs/common';
import { AppLoggerModule } from './common/logger.module';
import { DatabaseModule } from './database/database.module';
import { ShoppingModule } from './shopping/shopping.module';
import { AliceModule } from './alice/alice.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AppLoggerModule, DatabaseModule, ShoppingModule, AliceModule],
  controllers: [HealthController],
})
export class AppModule {}
