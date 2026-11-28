import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ItemSource = 'api' | 'alice' | 'telegram' | 'vk';

@Entity('shopping_items')
export class ShoppingItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'raw_name', type: 'text' })
  rawName!: string;

  @Index({ unique: true })
  @Column({ name: 'normalized_name', type: 'text' })
  normalizedName!: string;

  @Column({ name: 'source', type: 'text' })
  source!: ItemSource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
