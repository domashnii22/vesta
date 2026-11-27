# vesta

Семейный список покупок (MVP): один общий список, управление через приватный навык Алисы и Telegram-бота.

**Текущий этап: 1 — каркас и доменная логика** (без Алисы и Telegram). Есть NestJS-приложение, PostgreSQL через TypeORM, миграции, доменные операции add/remove/list, автотесты и структурированное логирование. Служебный REST-контур (`/items`, `/health`) — для приёмки и отладки, публичным API он не является.

## Стек

- NestJS 11 + TypeScript (strict)
- PostgreSQL 16, ORM: TypeORM (`@nestjs/typeorm`), миграции через CLI
- Логирование: `nestjs-pino` (структурированный JSON, уровни через `LOG_LEVEL`, requestId, redact чувствительных полей)
- Конфигурация: `@nestjs/config` + валидация env через `zod`
- Тесты: Jest; e2e — Testcontainers (поднимает реальный PostgreSQL в Docker)

## Требования

- Node.js 20+
- npm 10+
- Docker с Compose (для локальной БД и e2e-тестов)

## Установка

```bash
npm ci
cp .env.example .env
```

## Запуск локально

```bash
# 1. PostgreSQL в Docker
docker compose up -d db

# 2. Миграции базы данных
npm run migration:run

# 3. Приложение в режиме разработки (пересборка при изменениях)
npm run start:dev
```

Приложение слушает `http://localhost:3000` (порт задаётся `PORT` в `.env`).

### Проверка работы (ручная)

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl -X POST http://localhost:3000/items -H 'Content-Type: application/json' -d '{"name":"Молоко"}'
# {"result":"added","item":"Молоко"}

curl -X POST http://localhost:3000/items -H 'Content-Type: application/json' -d '{"name":" молоко "}'
# 409 {"error":"already-exists","item":"Молоко"}

curl http://localhost:3000/items
# {"items":["Молоко"],"count":1}

curl -X DELETE http://localhost:3000/items/молоко
# {"result":"removed","item":"Молоко"}

curl -X DELETE http://localhost:3000/items/несуществующее
# 404 {"error":"not-found","query":"несуществующее"}
```

Правила домена: имена нормализуются (регистр, пробелы); повторное добавление отклоняется (`409 already-exists`); удаление точное → удаляет, одно подстроковое совпадение → удаляет, несколько → `409 ambiguous` со списком вариантов (ничего не удаляется), ноль → `404 not-found`.

### Логи

Логи пишутся в stdout. В development — человекочитаемый формат (pino-pretty), в production — JSON (`NODE_ENV=production`). Уровень — `LOG_LEVEL`. Каждый запрос получает `x-request-id` (принимается из заголовка или генерируется). Поля `authorization` и прочие чувствительные заголовки/поля вырезаются (redact); секреты не логируются.

## Проверка (тесты и lint)

```bash
npm run lint        # ESLint (flat config, typescript-eslint)
npm run test        # unit-тесты доменной логики (Jest, без БД)
npm run test:e2e    # e2e-тесты: Testcontainers поднимает PostgreSQL в Docker
```

e2e-тестам нужен запущенный Docker (на Windows — Docker Desktop/WSL). Никакой другой инфраструктуры они не требуют: БД создаётся и удаляется автоматически.

## Миграции

```bash
npm run migration:run       # применить ожидающие миграции
npm run migration:revert    # откатить последнюю миграцию

# сгенерировать миграцию по изменениям сущностей (перед коммитом проверить вручную):
npm run migration:generate -- migrations/<Name>
```

## Переменные окружения

См. [.env.example](.env.example). Приложение не стартует с невалидной конфигурацией — ошибка валидации выводится в понятном виде.

| Переменная     | Назначение                                   |
| -------------- | -------------------------------------------- |
| `DATABASE_URL` | строка подключения PostgreSQL                |
| `PORT`         | порт HTTP (по умолчанию 3000)                |
| `LOG_LEVEL`    | уровень логов: debug / info / warn / error   |
| `NODE_ENV`     | окружение: development / test / production   |

## Структура

```
src/
  config/       env-схема (zod) и typed configuration
  common/       модуль логирования (nestjs-pino, redact, request-id)
  database/     TypeORM data-source для CLI миграций, DatabaseModule
  shopping/     домен: сущность, store-интерфейс, TypeORM-реализация,
                ShoppingListService, служебный контроллер /items
  health.controller.ts   GET /health (проверка приложения и БД)
migrations/     миграции TypeORM (в git)
test/           e2e-спеки, in-memory store для unit-тестов
```
