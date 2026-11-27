import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { normalizeItemName } from './normalize';
import {
  DuplicateItemNameError,
  SHOPPING_ITEM_STORE,
  ShoppingItemStore,
} from './shopping-item.store';
import { ItemSource, ShoppingItem } from './shopping-item.entity';

export type AddItemResult =
  | { kind: 'added'; item: ShoppingItem }
  | { kind: 'already-exists'; item: ShoppingItem };

export type RemoveItemResult =
  | { kind: 'removed'; item: ShoppingItem }
  | { kind: 'not-found'; query: string }
  | { kind: 'ambiguous'; query: string; matches: string[] };

@Injectable()
export class ShoppingListService {
  constructor(
    @Inject(SHOPPING_ITEM_STORE)
    private readonly store: ShoppingItemStore,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShoppingListService.name);
  }

  async add(rawInput: string, source: ItemSource): Promise<AddItemResult> {
    const normalizedName = normalizeItemName(rawInput);
    const log = this.logger.logger.child({ operation: 'shopping.add', item: normalizedName });

    try {
      const rawName = rawInput.trim().replace(/\s+/g, ' ');
      const item = await this.store.insert({ rawName, normalizedName, source });
      log.info({ itemId: item.id }, 'item added');
      return { kind: 'added', item };
    } catch (error) {
      if (error instanceof DuplicateItemNameError) {
        const existing = await this.store.findByName(normalizedName);
        log.info('add rejected: item already exists');
        return { kind: 'already-exists', item: existing ?? this.unknownItem(normalizedName) };
      }
      log.error({ err: error }, 'add failed');
      throw error;
    }
  }

  async remove(queryRaw: string): Promise<RemoveItemResult> {
    const query = normalizeItemName(queryRaw);
    const log = this.logger.logger.child({ operation: 'shopping.remove', query });

    const exact = await this.store.findByName(query);
    if (exact) {
      await this.store.remove(exact);
      log.info({ itemId: exact.id }, 'item removed (exact match)');
      return { kind: 'removed', item: exact };
    }

    const all = await this.store.findAll();
    const matches = all.filter(
      (item) =>
        item.normalizedName.includes(query) || query.includes(item.normalizedName),
    );

    if (matches.length === 0) {
      log.info('remove rejected: not found');
      return { kind: 'not-found', query };
    }
    if (matches.length > 1) {
      log.info({ matchCount: matches.length }, 'remove rejected: ambiguous match');
      return {
        kind: 'ambiguous',
        query,
        matches: matches.map((item) => item.rawName),
      };
    }

    const target = matches[0];
    await this.store.remove(target);
    log.info({ itemId: target.id }, 'item removed (single substring match)');
    return { kind: 'removed', item: target };
  }

  async list(): Promise<ShoppingItem[]> {
    const items = await this.store.findAll();
    this.logger.logger
      .child({ operation: 'shopping.list' })
      .debug({ count: items.length }, 'list requested');
    return items;
  }

  private unknownItem(normalizedName: string): ShoppingItem {
    const item = new ShoppingItem();
    item.rawName = normalizedName;
    item.normalizedName = normalizedName;
    item.source = 'api';
    return item;
  }
}
