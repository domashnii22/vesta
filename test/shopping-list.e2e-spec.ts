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

describe('Shopping list (e2e)', () => {
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

  it('GET /health returns ok', () => {
    return request(server).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('adds an item, normalizing name', async () => {
    await request(server)
      .post('/items')
      .send({ name: '  Молоко  ' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual({ result: 'added', item: 'Молоко' });
      });

    await request(server)
      .get('/items')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ items: ['Молоко'], count: 1 });
      });
  });

  it('rejects a duplicate with 409 already-exists', async () => {
    await request(server).post('/items').send({ name: 'Хлеб' }).expect(201);

    await request(server)
      .post('/items')
      .send({ name: ' хлеб ' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error).toBe('already-exists');
        expect(res.body.item).toBe('Хлеб');
      });

    await request(server)
      .get('/items')
      .expect((res) => {
        expect(res.body.count).toBe(1);
      });
  });

  it('rejects an invalid body with 400', () => {
    return request(server)
      .post('/items')
      .send({ name: '   ' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toBe('invalid-body');
      });
  });

  it('removes an exact match', async () => {
    await request(server).post('/items').send({ name: 'Кефир' }).expect(201);

    await request(server)
      .delete('/items/кефир')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ result: 'removed', item: 'Кефир' });
      });

    await request(server)
      .get('/items')
      .expect((res) => {
        expect(res.body.items).toEqual([]);
      });
  });

  it('responds 404 when nothing matches', () => {
    return request(server)
      .delete('/items/творог')
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe('not-found');
        expect(res.body.query).toBe('творог');
      });
  });

  it('responds 409 ambiguous and keeps the list unchanged', async () => {
    await request(server)
      .post('/items')
      .send({ name: 'хлеб бородинский' })
      .expect(201);
    await request(server)
      .post('/items')
      .send({ name: 'хлеб с семечками' })
      .expect(201);

    await request(server)
      .delete('/items/хлеб')
      .expect(409)
      .expect((res) => {
        expect(res.body.error).toBe('ambiguous');
        expect(res.body.matches.sort()).toEqual([
          'хлеб бородинский',
          'хлеб с семечками',
        ]);
      });

    await request(server)
      .get('/items')
      .expect((res) => {
        expect(res.body.count).toBe(2);
      });
  });

  it('enforces the unique index at the database level', async () => {
    const dataSource = app.get(DataSource);
    await dataSource
      .getRepository(ShoppingItem)
      .insert({ rawName: 'яйца', normalizedName: 'яйца', source: 'api' });

    await expect(
      dataSource
        .getRepository(ShoppingItem)
        .insert({ rawName: 'яйца', normalizedName: 'яйца', source: 'telegram' }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
