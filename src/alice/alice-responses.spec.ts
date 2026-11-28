import {
  addResultToText,
  buildListText,
  removeResultToText,
} from './alice-responses';
import { ShoppingItem } from '../shopping/shopping-item.entity';

function item(rawName: string): ShoppingItem {
  const shoppingItem = new ShoppingItem();
  shoppingItem.rawName = rawName;
  shoppingItem.normalizedName = rawName.toLowerCase();
  shoppingItem.source = 'alice';
  return shoppingItem;
}

describe('addResultToText', () => {
  it('confirms an added item', () => {
    expect(addResultToText({ kind: 'added', item: item('молоко') })).toBe(
      'Добавила молоко.',
    );
  });

  it('reports a duplicate', () => {
    expect(
      addResultToText({ kind: 'already-exists', item: item('молоко') }),
    ).toBe('Молоко уже есть в списке.');
  });
});

describe('removeResultToText', () => {
  it('confirms a removed item', () => {
    expect(removeResultToText({ kind: 'removed', item: item('хлеб') })).toBe(
      'Убрала хлеб.',
    );
  });

  it('reports a missing item', () => {
    expect(
      removeResultToText({ kind: 'not-found', query: 'хлеб' }),
    ).toBe('Не нашла хлеб в списке.');
  });

  it('asks to clarify an ambiguous match', () => {
    expect(
      removeResultToText({
        kind: 'ambiguous',
        query: 'хлеб',
        matches: ['хлеб бородинский', 'хлеб с семечками'],
      }),
    ).toBe('Уточните: хлеб бородинский или хлеб с семечками?');
  });

  it('truncates a long ambiguous list', () => {
    expect(
      removeResultToText({
        kind: 'ambiguous',
        query: 'хлеб',
        matches: ['хлеб 1', 'хлеб 2', 'хлеб 3', 'хлеб 4'],
      }),
    ).toBe('Уточните: хлеб 1 или хлеб 2 или хлеб 3 и другие?');
  });
});

describe('buildListText', () => {
  it('reports an empty list', () => {
    expect(buildListText([])).toBe('Список покупок пуст.');
  });

  it.each([
    [1, 'товар'],
    [2, 'товара'],
    [4, 'товара'],
    [5, 'товаров'],
    [11, 'товаров'],
    [21, 'товар'],
    [22, 'товара'],
  ])('pluralizes %i as %s', (count, word) => {
    const names = Array.from({ length: count }, (_, index) => `т${index}`);
    expect(buildListText(names)).toBe(
      `В списке ${count} ${word}: ${names.join(', ')}.`,
    );
  });
});
