export type TextCommand =
  | { kind: 'add'; itemName: string }
  | { kind: 'remove'; itemName: string }
  | { kind: 'list' }
  | { kind: 'missing-name' }
  | { kind: 'unknown' };

const ADD_VERBS = ['добавь', 'добавить', 'купи', 'покупай', 'запиши', 'внеси'];
const REMOVE_VERBS = ['удали', 'удалить', 'убери', 'вычеркни', 'вычеркнуть'];
const LIST_PHRASES = [
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
];

export function parseTextCommand(command: string): TextCommand {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (normalized === '') {
    return { kind: 'unknown' };
  }
  // Каналы передают текст как есть (VK) или lowercase (Алиса) — сравниваем
  // регистронезависимо, а аргумент режем из исходной строки с сохранением регистра.
  const lowered = normalized.toLowerCase();

  const addCommand = matchVerbCommand(normalized, lowered, ADD_VERBS, 'add');
  if (addCommand) {
    return addCommand;
  }

  const removeCommand = matchVerbCommand(normalized, lowered, REMOVE_VERBS, 'remove');
  if (removeCommand) {
    return removeCommand;
  }

  if (LIST_PHRASES.includes(lowered)) {
    return { kind: 'list' };
  }

  return { kind: 'unknown' };
}

function matchVerbCommand(
  normalized: string,
  lowered: string,
  verbs: string[],
  kind: 'add' | 'remove',
): TextCommand | null {
  for (const verb of verbs) {
    if (lowered === verb) {
      return { kind: 'missing-name' };
    }
    if (lowered.startsWith(`${verb} `)) {
      const itemName = stripFiller(normalized.slice(verb.length + 1).trim());
      if (itemName !== '') {
        return { kind, itemName };
      }
      return { kind: 'missing-name' };
    }
  }
  return null;
}

function stripFiller(itemName: string): string {
  const lowered = itemName.toLowerCase();
  for (const filler of ['в список покупок', 'в список', 'в списке']) {
    if (lowered === filler) {
      return '';
    }
    if (lowered.startsWith(`${filler} `)) {
      return itemName.slice(filler.length + 1).trim();
    }
  }
  return itemName;
}
