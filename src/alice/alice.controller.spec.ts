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
  return { controller, service, store };
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

  it('adds an item from a voice command with source alice', async () => {
    const { controller, store } = createController();

    const response = await controller.webhook(
      aliceRequest({ command: 'добавь молоко' }),
    );

    expect(response.response.text).toBe('Добавила молоко.');
    const added = await store.findByName('молоко');
    expect(added).not.toBeNull();
    expect(added?.source).toBe('alice');
  });

  it('reports a duplicate add', async () => {
    const { controller } = createController();
    await controller.webhook(aliceRequest({ command: 'добавь молоко' }));

    const response = await controller.webhook(
      aliceRequest({ command: 'купи молоко' }),
    );

    expect(response.response.text).toBe('Молоко уже есть в списке.');
  });

  it('removes an item by exact name', async () => {
    const { controller, service } = createController();
    await service.add('Хлеб', 'api');

    const response = await controller.webhook(
      aliceRequest({ command: 'убери хлеб' }),
    );

    expect(response.response.text).toBe('Убрала Хлеб.');
    expect(await service.list()).toHaveLength(0);
  });

  it('removes an item by a single substring match', async () => {
    const { controller, service } = createController();
    await service.add('Хлеб бородинский', 'api');

    const response = await controller.webhook(
      aliceRequest({ command: 'удали хлеб' }),
    );

    expect(response.response.text).toBe('Убрала Хлеб бородинский.');
    expect(await service.list()).toHaveLength(0);
  });

  it('reports a missing item on remove', async () => {
    const { controller } = createController();

    const response = await controller.webhook(
      aliceRequest({ command: 'удали хлеб' }),
    );

    expect(response.response.text).toBe('Не нашла хлеб в списке.');
  });

  it('asks to clarify an ambiguous remove and deletes nothing', async () => {
    const { controller, service } = createController();
    await service.add('Хлеб бородинский', 'api');
    await service.add('Хлеб с семечками', 'api');

    const response = await controller.webhook(
      aliceRequest({ command: 'удали хлеб' }),
    );

    expect(response.response.text).toContain('Уточните:');
    expect(response.response.text).toContain('Хлеб бородинский');
    expect(response.response.text).toContain('Хлеб с семечками');
    expect(await service.list()).toHaveLength(2);
  });

  it('answers a list command with the current list', async () => {
    const { controller, service } = createController();
    await service.add('Молоко', 'api');

    const response = await controller.webhook(
      aliceRequest({ command: 'что в списке' }),
    );

    expect(response.response.text).toContain('Молоко');
  });

  it('asks for the item name when a verb comes without one', async () => {
    const { controller } = createController();

    const response = await controller.webhook(
      aliceRequest({ command: 'добавь' }),
    );

    expect(response.response.text).toContain('Не поняла название');
  });

  it('answers an unrecognized command with a hint', async () => {
    const { controller } = createController();

    const response = await controller.webhook(
      aliceRequest({ command: 'расскажи анекдот' }),
    );

    expect(response.response.text).toContain('Не поняла');
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
