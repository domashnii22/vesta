import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CreateShoppingItems1764230400000 } from '../migrations/1764230400000-create-shopping-items';
import { ShoppingItem } from '../src/shopping/shopping-item.entity';

function aliceRequest(
  overrides: { command?: string; originalUtterance?: string } = {},
) {
  return {
    meta: { locale: 'ru-RU', timezone: 'Europe/Moscow', client_id: 'e2e' },
    session: {
      session_id: 'e2e-session',
      skill_id: 'e2e-skill',
      user_id: 'e2e-user',
      message_id: 1,
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

describe('Alice webhook (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('vesta_test')
      .withUsername('vesta')
      .withPassword('vesta')
      .start();

    process.env.DATABASE_URL =
      `postgres://vesta:vesta@${container.getHost()}:${container.getMappedPort(5432)}/vesta_test`;
    process.env.LOG_LEVEL = 'error';
    process.env.NODE_ENV = 'test';

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
    server = app.getHttpServer();
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    const dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM shopping_items');
  });

  it('answers a launch request with the current list from the database', async () => {
    await request(server).post('/items').send({ name: 'Молоко' }).expect(201);

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest())
      .expect(200)
      .expect((res) => {
        expect(res.body.version).toBe('1.0');
        expect(res.body.response.end_session).toBe(false);
        expect(res.body.response.text).toContain('Молоко');
      });
  });

  it('adds an item from a voice command and stores source alice', async () => {
    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'добавь молоко' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toBe('Добавила молоко.');
      });

    const dataSource = app.get(DataSource);
    const rows: { source: string }[] = await dataSource.query(
      "SELECT source FROM shopping_items WHERE normalized_name = 'молоко'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('alice');
  });

  it('reports a duplicate voice add', async () => {
    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'добавь молоко' }))
      .expect(200);

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'купи молоко' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toBe('Молоко уже есть в списке.');
      });
  });

  it('removes an item from a voice command', async () => {
    await request(server).post('/items').send({ name: 'Хлеб' }).expect(201);

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'убери хлеб' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toBe('Убрала Хлеб.');
      });

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'удали хлеб' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toBe('Не нашла хлеб в списке.');
      });
  });

  it('asks to clarify an ambiguous remove and deletes nothing', async () => {
    await request(server).post('/items').send({ name: 'Хлеб бородинский' }).expect(201);
    await request(server).post('/items').send({ name: 'Хлеб с семечками' }).expect(201);

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'удали хлеб' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toContain('Уточните:');
      });

    const dataSource = app.get(DataSource);
    const rows: { count: string }[] = await dataSource.query(
      'SELECT COUNT(*)::text AS count FROM shopping_items',
    );
    expect(rows[0].count).toBe('2');
  });

  it('answers a list command with the current list', async () => {
    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'добавь молоко' }))
      .expect(200);

    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'что в списке' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toContain('молоко');
      });
  });

  it('answers an unrecognized command with a hint', async () => {
    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'расскажи анекдот', originalUtterance: 'Расскажи анекдот' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toContain('Не поняла');
      });
  });

  it('rejects an invalid body with 400', async () => {
    await request(server)
      .post('/alice/webhook')
      .send({ nope: true })
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toBe('invalid-body');
      });
  });
});
