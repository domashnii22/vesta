import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigProperties } from '../config/configuration';
import { parseTextCommand } from '../common/commands/command-parser';
import {
  addResultToText,
  buildListText,
  MISSING_ITEM_NAME_HINT,
  removeResultToText,
  UNKNOWN_COMMAND_HINT,
} from '../common/commands/result-texts';
import { ShoppingListService } from '../shopping/shopping-list.service';
import { vkMessageNewEventSchema } from './vk-events.schema';

export interface VkReply {
  peerId: number;
  text: string;
}

const START_GREETING =
  'Привет! Я Веста — семейный список покупок. ' +
  'Напишите, например: добавь молоко. Показать список: «что в списке» или /list.';

@Injectable()
export class VkUpdateHandler {
  private readonly allowedPeerIds?: number[];

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly logger: PinoLogger,
    config: ConfigService<{ app: AppConfigProperties }, true>,
  ) {
    this.logger.setContext(VkUpdateHandler.name);
    this.allowedPeerIds = config.get('app.vkAllowedPeerIds', { infer: true });
  }

  async handle(rawEvent: unknown): Promise<VkReply | null> {
    const parsed = vkMessageNewEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      return null;
    }

    const { message } = parsed.data.object;
    const log = this.logger.logger.child({
      operation: 'vk.update',
      peerId: message.peer_id,
    });

    if (
      this.allowedPeerIds !== undefined &&
      !this.allowedPeerIds.includes(message.peer_id)
    ) {
      log.warn('event ignored: peer is not allowed');
      return null;
    }

    const text = message.text?.trim() ?? '';
    if (text === '') {
      log.info('non-text message answered with a hint');
      return { peerId: message.peer_id, text: UNKNOWN_COMMAND_HINT };
    }

    const reply = await this.answer(text);
    log.info('message answered');
    return { peerId: message.peer_id, text: reply };
  }

  private async answer(text: string): Promise<string> {
    if (text === '/start') {
      return START_GREETING;
    }
    if (text === '/list') {
      return this.currentListText();
    }

    const command = parseTextCommand(text);
    switch (command.kind) {
      case 'list':
        return this.currentListText();
      case 'add': {
        const result = await this.shoppingList.add(command.itemName, 'vk');
        return addResultToText(result);
      }
      case 'remove': {
        const result = await this.shoppingList.remove(command.itemName);
        return removeResultToText(result);
      }
      case 'missing-name':
        return MISSING_ITEM_NAME_HINT;
      case 'unknown':
        return UNKNOWN_COMMAND_HINT;
    }
  }

  private async currentListText(): Promise<string> {
    const items = await this.shoppingList.list();
    return buildListText(items.map((item) => item.rawName));
  }
}
