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
      const items = await this.shoppingList.list();
      log.info({ itemCount: items.length }, 'launch answered with the current list');
      return buildAliceResponse(version, buildListText(items.map((item) => item.rawName)));
    }

    const utterance = request.original_utterance.trim() || request.command.trim();
    log.info('utterance answered with echo');
    return buildAliceResponse(version, buildEchoText(utterance));
  }
}

function buildListText(names: string[]): string {
  if (names.length === 0) {
    return 'Список покупок пуст.';
  }
  return `В списке ${names.length} ${pluralizeTovar(names.length)}: ${names.join(', ')}.`;
}

function buildEchoText(utterance: string): string {
  return `Услышала: «${utterance}». Пока я умею только показывать список — спросите: «что в списке?»`;
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
