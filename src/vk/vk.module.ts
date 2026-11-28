import { Module } from '@nestjs/common';
import { ShoppingModule } from '../shopping/shopping.module';
import { VkApiClient } from './vk-api.client';
import { VkPollerService } from './vk-poller.service';
import { VkUpdateHandler } from './vk-update.handler';

@Module({
  imports: [ShoppingModule],
  providers: [VkApiClient, VkUpdateHandler, VkPollerService],
})
export class VkModule {}
