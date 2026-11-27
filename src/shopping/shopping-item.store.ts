import { ItemSource, ShoppingItem } from './shopping-item.entity';

export class DuplicateItemNameError extends Error {
  constructor(public readonly normalizedName: string) {
    super(`Item with normalized name "${normalizedName}" already exists`);
    this.name = 'DuplicateItemNameError';
  }
}

export interface NewShoppingItem {
  rawName: string;
  normalizedName: string;
  source: ItemSource;
}

export interface ShoppingItemStore {
  findByName(normalizedName: string): Promise<ShoppingItem | null>;
  findAll(): Promise<ShoppingItem[]>;
  insert(item: NewShoppingItem): Promise<ShoppingItem>;
  remove(item: ShoppingItem): Promise<void>;
}

export const SHOPPING_ITEM_STORE = Symbol('SHOPPING_ITEM_STORE');
