import { parseTextCommand } from './command-parser';

describe('parseTextCommand', () => {
  describe('add', () => {
    it.each([
      ['добавь молоко', 'молоко'],
      ['купи хлеб', 'хлеб'],
      ['добавить сахар', 'сахар'],
      ['покупай яйца', 'яйца'],
      ['запиши гречку', 'гречку'],
      ['внеси кофе', 'кофе'],
      ['добавь сливочное масло', 'сливочное масло'],
      ['добавь в список молоко', 'молоко'],
      ['купи в список покупок хлеб', 'хлеб'],
      ['  добавь   молоко  ', 'молоко'],
    ])('parses %j as add(%j)', (command, itemName) => {
      expect(parseTextCommand(command)).toEqual({ kind: 'add', itemName });
    });
  });

  describe('remove', () => {
    it.each([
      ['удали хлеб', 'хлеб'],
      ['убери молоко', 'молоко'],
      ['удалить сахар', 'сахар'],
      ['вычеркни гречку', 'гречку'],
      ['вычеркнуть кофе', 'кофе'],
      ['убери сливочное масло', 'сливочное масло'],
    ])('parses %j as remove(%j)', (command, itemName) => {
      expect(parseTextCommand(command)).toEqual({ kind: 'remove', itemName });
    });
  });

  describe('list', () => {
    it.each([
      'что в списке',
      'что у нас в списке',
      'покажи список',
      'покажи список покупок',
      'список',
      'список покупок',
      'какие покупки',
      'что купить',
      'что надо купить',
      'что нужно купить',
    ])('parses %j as list', (command) => {
      expect(parseTextCommand(command)).toEqual({ kind: 'list' });
    });
  });

  describe('case-insensitive input (VK sends text as typed)', () => {
    it.each([
      ['Добавь манго', { kind: 'add', itemName: 'манго' }],
      ['ДОБАВЬ Хлеб', { kind: 'add', itemName: 'Хлеб' }],
      ['Убери Хлеб', { kind: 'remove', itemName: 'Хлеб' }],
      ['Что в списке', { kind: 'list' }],
      ['Добавь', { kind: 'missing-name' }],
      ['Добавь В Список Молоко', { kind: 'add', itemName: 'Молоко' }],
    ])('parses %j', (command, expected) => {
      expect(parseTextCommand(command)).toEqual(expected);
    });
  });

  describe('missing-name', () => {
    it.each(['добавь', 'удали', 'купи ', 'добавь в список'])(
      'parses %j as missing-name',
      (command) => {
        expect(parseTextCommand(command)).toEqual({ kind: 'missing-name' });
      },
    );
  });

  describe('unknown', () => {
    it.each([
      '',
      '   ',
      'привет',
      'расскажи анекдот',
      'молоко',
    ])('parses %j as unknown', (command) => {
      expect(parseTextCommand(command)).toEqual({ kind: 'unknown' });
    });
  });
});
