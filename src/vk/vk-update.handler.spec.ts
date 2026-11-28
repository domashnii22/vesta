import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigProperties } from '../config/configuration';
import { ShoppingListService } from '../shopping/shopping-list.service';
import { InMemoryShoppingItemStore } from '../../test/in-memory-shopping-item.store';
import { VkUpdateHandler } from './vk-update.handler';

const PEER_ID = 123;

function vkMessageNew(text?: string, peerId: number = PEER_ID) {
  return {
    group_id: 1,
    type: 'message_new',
    object: {
      message: {
        id: 10,
        peer_id: peerId,
        from_id: peerId,
        ...(text === undefined ? { attachments: [] } : { text }),
      },
      client_info: {},
    },
  };
}

function createHandler(options: { allowedPeerIds?: number[] } = {}) {
  const store = new InMemoryShoppingItemStore();
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const service = new ShoppingListService(store, logger);
  const config = {
    get: (key: string) =>
      key === 'app.vkAllowedPeerIds' ? options.allowedPeerIds : undefined,
  } as ConfigService<{ app: AppConfigProperties }, true>;
  const handler = new VkUpdateHandler(service, logger, config);
  return { handler, service, store };
}

describe('VkUpdateHandler', () => {
  it('adds an item with source vk', async () => {
    const { handler, store } = createHandler();

    const reply = await handler.handle(vkMessageNew('добавь молоко'));

    expect(reply).toEqual({ peerId: PEER_ID, text: 'Добавила молоко.' });
    const added = await store.findByName('молоко');
    expect(added?.source).toBe('vk');
  });

  it('reports a duplicate add', async () => {
    const { handler } = createHandler();
    await handler.handle(vkMessageNew('добавь молоко'));

    const reply = await handler.handle(vkMessageNew('купи молоко'));

    expect(reply?.text).toBe('Молоко уже есть в списке.');
  });

  it('removes an item', async () => {
    const { handler, service } = createHandler();
    await service.add('Хлеб', 'api');

    const reply = await handler.handle(vkMessageNew('убери хлеб'));

    expect(reply?.text).toBe('Убрала Хлеб.');
    expect(await service.list()).toHaveLength(0);
  });

  it('answers a list command', async () => {
    const { handler, service } = createHandler();
    await service.add('Молоко', 'api');

    const reply = await handler.handle(vkMessageNew('что в списке'));

    expect(reply?.text).toContain('Молоко');
  });

  it('answers /list with the current list', async () => {
    const { handler } = createHandler();

    const reply = await handler.handle(vkMessageNew('/list'));

    expect(reply?.text).toContain('пуст');
  });

  it('greets on /start', async () => {
    const { handler } = createHandler();

    const reply = await handler.handle(vkMessageNew('/start'));

    expect(reply?.text).toContain('Веста');
  });

  it('asks for the item name when a verb comes without one', async () => {
    const { handler } = createHandler();

    const reply = await handler.handle(vkMessageNew('добавь'));

    expect(reply?.text).toContain('Не поняла название');
  });

  it('answers an unrecognized command with a hint', async () => {
    const { handler } = createHandler();

    const reply = await handler.handle(vkMessageNew('расскажи анекдот'));

    expect(reply?.text).toContain('Не поняла');
  });

  it('answers a non-text message with a hint', async () => {
    const { handler } = createHandler();

    const reply = await handler.handle(vkMessageNew(undefined));

    expect(reply?.text).toContain('Не поняла');
  });

  it('ignores events of other types', async () => {
    const { handler } = createHandler();

    expect(await handler.handle({ type: 'message_reply', object: {} })).toBeNull();
    expect(await handler.handle({ nope: true })).toBeNull();
  });

  it('ignores peers outside the allow-list', async () => {
    const { handler } = createHandler({ allowedPeerIds: [PEER_ID] });

    expect(await handler.handle(vkMessageNew('добавь молоко', 999))).toBeNull();
    const reply = await handler.handle(vkMessageNew('добавь молоко', PEER_ID));
    expect(reply?.text).toBe('Добавила молоко.');
  });
});
