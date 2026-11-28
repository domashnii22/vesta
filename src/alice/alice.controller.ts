import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigProperties } from '../config/configuration';
import { ShoppingListService } from '../shopping/shopping-list.service';
import {
  AliceResponse,
  aliceRequestSchema,
  buildAliceResponse,
} from './alice-protocol';
import { parseAliceCommand } from './command-parser';
import {
  addResultToText,
  buildListText,
  MISSING_ITEM_NAME_HINT,
  removeResultToText,
  UNKNOWN_COMMAND_HINT,
} from './alice-responses';

@Controller('alice')
export class AliceController {
  private readonly expectedSkillId?: string;

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly logger: PinoLogger,
    config: ConfigService<{ app: AppConfigProperties }, true>,
  ) {
    this.logger.setContext(AliceController.name);
    this.expectedSkillId = config.get('app.aliceSkillId', { infer: true });
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() body: unknown): Promise<AliceResponse> {
    const parsed = aliceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid-body',
        issues: parsed.error.issues,
      });
    }

    const { version, session, request } = parsed.data;
    const log = this.logger.logger.child({
      operation: 'alice.webhook',
      sessionId: session.session_id,
      skillId: session.skill_id,
    });

    if (
      this.expectedSkillId !== undefined &&
      session.skill_id !== this.expectedSkillId
    ) {
      log.warn('webhook rejected: unexpected skill_id');
      throw new ForbiddenException({ error: 'forbidden-skill' });
    }

    if (request.command.trim() === '') {
      const text = await this.currentListText();
      log.info('launch answered with the current list');
      return buildAliceResponse(version, text);
    }

    const command = parseAliceCommand(request.command);
    log.info({ intent: command.kind }, 'command parsed');

    switch (command.kind) {
      case 'list': {
        const text = await this.currentListText();
        return buildAliceResponse(version, text);
      }
      case 'add': {
        const result = await this.shoppingList.add(command.itemName, 'alice');
        log.info({ result: result.kind }, 'add command answered');
        return buildAliceResponse(version, addResultToText(result));
      }
      case 'remove': {
        const result = await this.shoppingList.remove(command.itemName);
        log.info({ result: result.kind }, 'remove command answered');
        return buildAliceResponse(version, removeResultToText(result));
      }
      case 'missing-name':
        return buildAliceResponse(version, MISSING_ITEM_NAME_HINT);
      case 'unknown':
        return buildAliceResponse(version, UNKNOWN_COMMAND_HINT);
    }
  }

  private async currentListText(): Promise<string> {
    const items = await this.shoppingList.list();
    return buildListText(items.map((item) => item.rawName));
  }
}
