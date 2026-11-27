import { PinoLogger } from 'nestjs-pino';
import { ShoppingListService } from './shopping-list.service';
import { InMemoryShoppingItemStore } from '../../test/in-memory-shopping-item.store';

function createService(store = new InMemoryShoppingItemStore()) {
  const logger = new PinoLogger({
    pinoHttp: { level: 'silent' },
  });
  const service = new ShoppingListService(store, logger);
  return { service, store };
}

describe('ShoppingListService', () => {
  describe('add', () => {
    it('adds a new item', async () => {
      const { service } = createService();

      const result = await service.add('Молоко', 'api');

      expect(result.kind).toBe('added');
      if (result.kind === 'added') {
        expect(result.item.normalizedName).toBe('молоко');
        expect(result.item.rawName).toBe('Молоко');
      }
    });

    it('normalizes case and whitespace', async () => {
      const { service } = createService();

      await service.add('  Хлеб   Бородинский ', 'api');
      const items = await service.list();

      expect(items).toHaveLength(1);
      expect(items[0].rawName).toBe('Хлеб Бородинский');
      expect(items[0].normalizedName).toBe('хлеб бородинский');
    });

    it('rejects a duplicate with already-exists', async () => {
      const { service, store } = createService();
      await service.add('Молоко', 'api');
      const before = await store.findAll();

      const result = await service.add('молоко ', 'telegram');

      expect(result.kind).toBe('already-exists');
      expect(await store.findAll()).toEqual(before);
    });

    it('treats unique-index conflict as already-exists', async () => {
      const store = new InMemoryShoppingItemStore();
      const { service } = createService(store);
      await store.insert({
        rawName: 'яйца',
        normalizedName: 'яйца',
        source: 'api',
      });

      const result = await service.add('Яйца', 'api');

      expect(result.kind).toBe('already-exists');
      expect(result.item.normalizedName).toBe('яйца');
    });
  });

  describe('remove', () => {
    it('removes an exact match', async () => {
      const { service, store } = createService();
      await store.insert({
        rawName: 'молоко',
        normalizedName: 'молоко',
        source: 'api',
      });

      const result = await service.remove('Молоко');

      expect(result.kind).toBe('removed');
      expect(await store.findAll()).toHaveLength(0);
    });

    it('removes the only substring match', async () => {
      const { service, store } = createService();
      await store.insert({
        rawName: 'хлеб бородинский',
        normalizedName: 'хлеб бородинский',
        source: 'api',
      });

      const result = await service.remove('бородинский');

      expect(result.kind).toBe('removed');
      expect(await store.findAll()).toHaveLength(0);
    });

    it('reports not-found when nothing matches', async () => {
      const { service } = createService();

      const result = await service.remove('кефир');

      expect(result).toEqual({ kind: 'not-found', query: 'кефир' });
    });

    it('does not remove anything when the match is ambiguous', async () => {
      const { service, store } = createService();
      await store.insert({
        rawName: 'хлеб бородинский',
        normalizedName: 'хлеб бородинский',
        source: 'api',
      });
      await store.insert({
        rawName: 'хлеб с семечками',
        normalizedName: 'хлеб с семечками',
        source: 'api',
      });

      const result = await service.remove('хлеб');

      expect(result.kind).toBe('ambiguous');
      if (result.kind === 'ambiguous') {
        expect(result.matches.sort()).toEqual([
          'хлеб бородинский',
          'хлеб с семечками',
        ]);
      }
      expect(await store.findAll()).toHaveLength(2);
    });

    it('prefers exact match even when other items contain the query', async () => {
      const { service, store } = createService();
      await store.insert({
        rawName: 'хлеб',
        normalizedName: 'хлеб',
        source: 'api',
      });
      await store.insert({
        rawName: 'хлеб бородинский',
        normalizedName: 'хлеб бородинский',
        source: 'api',
      });

      const result = await service.remove('хлеб');

      expect(result.kind).toBe('removed');
      if (result.kind === 'removed') {
        expect(result.item.normalizedName).toBe('хлеб');
      }
      const remaining = await store.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].normalizedName).toBe('хлеб бородинский');
    });
  });

  describe('list', () => {
    it('returns items in insertion order', async () => {
      const { service, store } = createService();
      await store.insert({
        rawName: 'молоко',
        normalizedName: 'молоко',
        source: 'api',
      });
      await store.insert({
        rawName: 'хлеб',
        normalizedName: 'хлеб',
        source: 'telegram',
      });

      const items = await service.list();

      expect(items.map((item) => item.normalizedName)).toEqual([
        'молоко',
        'хлеб',
      ]);
    });

    it('returns an empty list when nothing was added', async () => {
      const { service } = createService();

      expect(await service.list()).toEqual([]);
    });
  });
});
