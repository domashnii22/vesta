import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ShoppingListService } from './shopping-list.service';

const addItemSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'name must not be empty').max(200)),
});

@Controller('items')
export class ItemsController {
  constructor(private readonly shoppingList: ShoppingListService) {}

  @Get()
  async list() {
    const items = await this.shoppingList.list();
    return { items: items.map((item) => item.rawName), count: items.length };
  }

  @Post()
  async add(@Body() body: unknown) {
    const parsed = addItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid-body',
        issues: parsed.error.issues,
      });
    }
    const result = await this.shoppingList.add(parsed.data.name, 'api');
    if (result.kind === 'already-exists') {
      throw new ConflictException({ error: 'already-exists', item: result.item.rawName });
    }
    return { result: 'added', item: result.item.rawName };
  }

  @Delete(':name')
  @HttpCode(200)
  async remove(@Param('name') name: string) {
    const result = await this.shoppingList.remove(name);
    switch (result.kind) {
      case 'removed':
        return { result: 'removed', item: result.item.rawName };
      case 'not-found':
        throw new NotFoundException({ error: 'not-found', query: result.query });
      case 'ambiguous':
        throw new ConflictException({
          error: 'ambiguous',
          query: result.query,
          matches: result.matches,
        });
    }
  }
}
