import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoppingItem } from './shopping-item.entity';
import { SHOPPING_ITEM_STORE } from './shopping-item.store';
import { ShoppingListService } from './shopping-list.service';
import { TypeormShoppingItemStore } from './typeorm-shopping-item.store';
import { ItemsController } from './items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShoppingItem])],
  controllers: [ItemsController],
  providers: [
    ShoppingListService,
    {
      provide: SHOPPING_ITEM_STORE,
      useClass: TypeormShoppingItemStore,
    },
  ],
  exports: [ShoppingListService],
})
export class ShoppingModule {}
