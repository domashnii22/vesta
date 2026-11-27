import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShoppingItems1764230400000 implements MigrationInterface {
  name = 'CreateShoppingItems1764230400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE shopping_items (
        id              bigserial PRIMARY KEY,
        raw_name        text NOT NULL,
        normalized_name text NOT NULL,
        source          text NOT NULL DEFAULT 'api',
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_shopping_items_normalized_name
        ON shopping_items (normalized_name)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE shopping_items');
  }
}
