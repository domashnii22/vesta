import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AliceController } from './alice.controller';
import { AppConfigProperties } from '../config/configuration';
import { ShoppingListService } from '../shopping/shopping-list.service';
import { InMemoryShoppingItemStore } from '../../test/in-memory-shopping-item.store';

const SKILL_ID = 'skill-1';

function aliceRequest(
  overrides: {
    command?: string;
    originalUtterance?: string;
    skillId?: string;
  } = {},
) {
  return {
    meta: { locale: 'ru-RU', timezone: 'Europe/Moscow' },
    session: {
      session_id: 'session-1',
      skill_id: overrides.skillId ?? SKILL_ID,
      user_id: 'user-1',
      message_id: 0,
      new: true,
    },
    request: {
      command: overrides.command ?? '',
      original_utterance: overrides.originalUtterance ?? '',
      type: 'SimpleUtterance',
    },
    state: { user: {}, session: {}, skill: {} },
    version: '1.0',
  };
}

function createController(options: { expectedSkillId?: string } = {}) {
  const store = new InMemoryShoppingItemStore();
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const service = new ShoppingListService(store, logger);
  const config = {
    get: (key: string) =>
      key === 'app.aliceSkillId' ? options.expectedSkillId : undefined,
  } as ConfigService<{ app: AppConfigProperties }, true>;
  const controller = new AliceController(service, logger, config);
  return { controller, service };
}

describe('AliceController', () => {
  it('answers a launch request with the current list', async () => {
    const { controller, service } = createController();
    await service.add('Молоко', 'api');
    await service.add('Хлеб', 'api');

    const response = await controller.webhook(aliceRequest());

    expect(response.version).toBe('1.0');
    expect(response.response.end_session).toBe(false);
    expect(response.response.text).toContain('Молоко');
    expect(response.response.text).toContain('Хлеб');
  });

  it('answers a launch request with an empty-list message', async () => {
    const { controller } = createController();

    const response = await controller.webhook(aliceRequest());

    expect(response.response.text).toContain('пуст');
  });

  it('echoes a non-empty command', async () => {
    const { controller } = createController();

    const response = await controller.webhook(
      aliceRequest({ command: 'привет', originalUtterance: 'Привет, Веста' }),
    );

    expect(response.response.text).toContain('Привет, Веста');
  });

  it('rejects an invalid body with 400', async () => {
    const { controller } = createController();

    await expect(
      controller.webhook({ hello: 'world' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a foreign skill_id when ALICE_SKILL_ID is set', async () => {
    const { controller } = createController({ expectedSkillId: SKILL_ID });

    await expect(
      controller.webhook(aliceRequest({ skillId: 'another-skill' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the configured skill_id', async () => {
    const { controller } = createController({ expectedSkillId: SKILL_ID });

    const response = await controller.webhook(aliceRequest());

    expect(response.response.text).toContain('пуст');
  });
});
