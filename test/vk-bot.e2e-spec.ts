import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module';
import { CreateShoppingItems1764230400000 } from '../migrations/1764230400000-create-shopping-items';
import { ShoppingItem } from '../src/shopping/shopping-item.entity';

const PEER_ID = 424242;

interface SentMessage {
  peer_id: string;
  message: string;
}

function messageNewEvent(eventId: number, text: string) {
  return {
    group_id: 1,
    type: 'message_new',
    object: {
      message: {
        id: eventId,
        peer_id: PEER_ID,
        from_id: PEER_ID,
        text,
      },
      client_info: {},
    },
  };
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('waitFor timed out');
}

describe('VK bot (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let stub: Server;
  let stubPort: number;
  let pendingEvents: unknown[] = [];
  let nextEventId = 1;
  let sentMessages: SentMessage[] = [];

  function enqueueMessage(text: string) {
    pendingEvents.push(messageNewEvent(nextEventId++, text));
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('vesta_test')
      .withUsername('vesta')
      .withPassword('vesta')
      .start();

    stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        const url = new URL(req.url ?? '', `http://127.0.0.1:${stubPort}`);

        if (url.pathname === '/method/groups.getLongPollServer') {
          res.end(
            JSON.stringify({
              response: {
                server: `http://127.0.0.1:${stubPort}/lp`,
                key: 'stub-key',
                ts: '1',
              },
            }),
          );
          return;
        }
        if (url.pathname === '/lp') {
          const ts = Number(url.searchParams.get('ts') ?? '1');
          const updates = pendingEvents;
          pendingEvents = [];
          setTimeout(
            () =>
              res.end(
                JSON.stringify({ ts: String(ts + 1), updates }),
              ),
            updates.length === 0 ? 25 : 0,
          );
          return;
        }
        if (url.pathname === '/method/messages.send') {
          const params = new URLSearchParams(body);
          sentMessages.push({
            peer_id: params.get('peer_id') ?? '',
            message: params.get('message') ?? '',
          });
          res.end(JSON.stringify({ response: 1 }));
          return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { error_code: 3, error_msg: 'unknown method' } }));
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    stubPort = (stub.address() as AddressInfo).port;

    process.env.DATABASE_URL =
      `postgres://vesta:vesta@${container.getHost()}:${container.getMappedPort(5432)}/vesta_test`;
    process.env.LOG_LEVEL = 'error';
    process.env.NODE_ENV = 'test';
    process.env.VK_GROUP_TOKEN = 'e2e-vk-token';
    process.env.VK_GROUP_ID = '1';
    process.env.VK_API_BASE_URL = `http://127.0.0.1:${stubPort}`;

    const migrationsSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [ShoppingItem],
      migrations: [CreateShoppingItems1764230400000],
    });
    await migrationsSource.initialize();
    await migrationsSource.runMigrations();
    await migrationsSource.destroy();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await new Promise((resolve) => stub?.close(resolve));
    await container?.stop();
  });

  beforeEach(async () => {
    const dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM shopping_items');
    sentMessages = [];
  });

  it('processes commands through Bots Long Poll', async () => {
    enqueueMessage('добавь молоко');
    enqueueMessage('купи молоко');
    enqueueMessage('что в списке');

    await waitFor(() => sentMessages.length === 3);

    expect(sentMessages.map((m) => m.message)).toEqual([
      'Добавила молоко.',
      'Молоко уже есть в списке.',
      'В списке 1 товар: молоко.',
    ]);
    expect(sentMessages.every((m) => m.peer_id === String(PEER_ID))).toBe(true);

    const dataSource = app.get(DataSource);
    const rows: { source: string }[] = await dataSource.query(
      "SELECT source FROM shopping_items WHERE normalized_name = 'молоко'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('vk');

    enqueueMessage('удали молоко');
    await waitFor(() => sentMessages.length === 4);

    expect(sentMessages[3].message).toBe('Убрала молоко.');
    const remaining: { count: string }[] = await dataSource.query(
      'SELECT COUNT(*)::text AS count FROM shopping_items',
    );
    expect(remaining[0].count).toBe('0');
  });

  it('answers /start with a greeting', async () => {
    enqueueMessage('/start');

    await waitFor(() => sentMessages.length === 1);

    expect(sentMessages[0].message).toContain('Веста');
  });
});
