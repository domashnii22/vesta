import {
  DuplicateItemNameError,
  NewShoppingItem,
  ShoppingItemStore,
} from '../src/shopping/shopping-item.store';
import { ShoppingItem } from '../src/shopping/shopping-item.entity';

export class InMemoryShoppingItemStore implements ShoppingItemStore {
  private items = new Map<string, ShoppingItem>();
  private sequence = 1;

  async findByName(normalizedName: string): Promise<ShoppingItem | null> {
    return this.items.get(normalizedName) ?? null;
  }

  async findAll(): Promise<ShoppingItem[]> {
    return [...this.items.values()].sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime());
  }

  async insert(newItem: NewShoppingItem): Promise<ShoppingItem> {
    if (this.items.has(newItem.normalizedName)) {
      throw new DuplicateItemNameError(newItem.normalizedName);
    }
    const item = new ShoppingItem();
    item.id = String(this.sequence++);
    item.rawName = newItem.rawName;
    item.normalizedName = newItem.normalizedName;
    item.source = newItem.source;
    item.createdAt = new Date();
    this.items.set(item.normalizedName, item);
    return item;
  }

  async remove(item: ShoppingItem): Promise<void> {
    this.items.delete(item.normalizedName);
  }
}
