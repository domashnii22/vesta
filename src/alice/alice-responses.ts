import {
  AddItemResult,
  RemoveItemResult,
} from '../shopping/shopping-list.service';

export const UNKNOWN_COMMAND_HINT =
  'Не поняла. Скажите, например: добавь молоко.';

export const MISSING_ITEM_NAME_HINT =
  'Не расслышала название товара. Скажите, например: добавь молоко.';

const AMBIGUOUS_MATCHES_LIMIT = 3;

export function addResultToText(result: AddItemResult): string {
  if (result.kind === 'added') {
    return `Добавила ${result.item.rawName}.`;
  }
  return `${capitalize(result.item.rawName)} уже есть в списке.`;
}

export function removeResultToText(result: RemoveItemResult): string {
  switch (result.kind) {
    case 'removed':
      return `Убрала ${result.item.rawName}.`;
    case 'not-found':
      return `Не нашла ${result.query} в списке.`;
    case 'ambiguous':
      return `Уточните: ${formatMatches(result.matches)}?`;
  }
}

export function buildListText(names: string[]): string {
  if (names.length === 0) {
    return 'Список покупок пуст.';
  }
  return `В списке ${names.length} ${pluralizeTovar(names.length)}: ${names.join(', ')}.`;
}

function formatMatches(matches: string[]): string {
  const shown = matches.slice(0, AMBIGUOUS_MATCHES_LIMIT);
  const suffix = matches.length > AMBIGUOUS_MATCHES_LIMIT ? ' и другие' : '';
  return `${shown.join(' или ')}${suffix}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralizeTovar(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return 'товаров';
  }
  if (last === 1) {
    return 'товар';
  }
  if (last >= 2 && last <= 4) {
    return 'товара';
  }
  return 'товаров';
}
