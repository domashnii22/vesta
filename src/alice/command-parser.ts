export type AliceCommand =
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

export function parseAliceCommand(command: string): AliceCommand {
  const normalized = command.trim().replace(/\s+/g, ' ');
  if (normalized === '') {
    return { kind: 'unknown' };
  }

  const addCommand = matchVerbCommand(normalized, ADD_VERBS, 'add');
  if (addCommand) {
    return addCommand;
  }

  const removeCommand = matchVerbCommand(normalized, REMOVE_VERBS, 'remove');
  if (removeCommand) {
    return removeCommand;
  }

  if (LIST_PHRASES.includes(normalized)) {
    return { kind: 'list' };
  }

  return { kind: 'unknown' };
}

function matchVerbCommand(
  normalized: string,
  verbs: string[],
  kind: 'add' | 'remove',
): AliceCommand | null {
  for (const verb of verbs) {
    if (normalized === verb) {
      return { kind: 'missing-name' };
    }
    if (normalized.startsWith(`${verb} `)) {
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
  for (const filler of ['в список покупок', 'в список', 'в списке']) {
    if (itemName === filler) {
      return '';
    }
    if (itemName.startsWith(`${filler} `)) {
      return itemName.slice(filler.length + 1).trim();
    }
  }
  return itemName;
}
