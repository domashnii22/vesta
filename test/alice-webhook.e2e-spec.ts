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

  it('echoes a non-empty command', async () => {
    await request(server)
      .post('/alice/webhook')
      .send(aliceRequest({ command: 'привет', originalUtterance: 'Привет' }))
      .expect(200)
      .expect((res) => {
        expect(res.body.response.text).toContain('Привет');
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
