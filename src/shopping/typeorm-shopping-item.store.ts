import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  DuplicateItemNameError,
  NewShoppingItem,
  ShoppingItemStore,
} from './shopping-item.store';
import { ShoppingItem } from './shopping-item.entity';

@Injectable()
export class TypeormShoppingItemStore implements ShoppingItemStore {
  constructor(
    @InjectRepository(ShoppingItem)
    private readonly repository: Repository<ShoppingItem>,
  ) {}

  findByName(normalizedName: string): Promise<ShoppingItem | null> {
    return this.repository.findOneBy({ normalizedName });
  }

  findAll(): Promise<ShoppingItem[]> {
    return this.repository.find({ order: { createdAt: 'ASC' } });
  }

  async insert(item: NewShoppingItem): Promise<ShoppingItem> {
    try {
      return await this.repository.save(this.repository.create(item));
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError?.code === '23505') {
        throw new DuplicateItemNameError(item.normalizedName);
      }
      throw error;
    }
  }

  async remove(item: ShoppingItem): Promise<void> {
    await this.repository.delete({ id: item.id });
  }
}
