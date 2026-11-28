# AGENTS.md

Инструкция для AI-агентов, работающих в этом репозитории. Читатель ничего о проекте не знает — сверяйтесь с этим файлом перед изменениями.

## Обзор проекта

**vesta** — семейный список покупок (MVP): один общий список, которым семья управляет через приватный навык Алисы и Telegram-бота.

Текущий этап — **2: интеграция с Алисой (начата)**. Есть NestJS-приложение, PostgreSQL через TypeORM, миграции, доменные операции `add` / `remove` / `list`, автотесты и структурированное логирование. Добавлен webhook Яндекс Диалогов `POST /alice/webhook`: разбор голосовых команд (`добавь …`, `удали …`, «что в списке») правилами на бэкенде и ответы результатами доменных операций; Telegram пока не реализован. Для живой приёмки webhook до локального бэкенда поднимается HTTPS-туннель (ngrok/cloudflared) — настраивается вне репозитория. Служебный REST-контур (`/items`, `/health`) существует только для приёмки и отладки — **публичным API он не является** (аутентификации нет, наружу не публикуется).

Документация и комментарии в проекте ведутся на русском; идентификаторы кода — на английском.

## Стек и требования

- Node.js 20+, npm 10+ (разработка велась на Node 24 — работает).
- NestJS 11 + TypeScript в режиме `strict`, target ES2022, CommonJS.
- PostgreSQL 16, ORM: TypeORM 0.3 (`@nestjs/typeorm`), миграции через TypeORM CLI (через `ts-node`).
- Валидация: `zod` — и для переменных окружения, и для тел HTTP-запросов.
- Логирование: `nestjs-pino` (JSON в production, `pino-pretty` в остальных окружениях).
- Тесты: Jest + ts-jest; e2e — supertest + Testcontainers (реальный PostgreSQL в Docker).
- Линтер: ESLint 9 flat config (`eslint.config.mjs`) + typescript-eslint, без prettier.

## Основные команды

```bash
npm ci                          # установка зависимостей
cp .env.example .env            # локальная конфигурация (нужна для запуска и миграций)

docker compose up -d db         # локальная БД (postgres:16-alpine, порт хоста 5433)
npm run migration:run           # применить миграции
npm run start:dev               # dev-режим с пересборкой (порт из .env, по умолчанию 3000)

npm run build                   # nest build → dist/
npm run start                   # node dist/main (production-запуск)

npm run lint                    # ESLint по src/ и test/
npm run test                    # unit-тесты (Jest, без БД)
npm run test:e2e                # e2e-тесты — нужен запущенный Docker (на Windows Docker Desktop/WSL)

npm run migration:revert        # откатить последнюю миграцию
npm run migration:generate -- migrations/<Name>   # сгенерировать миграцию по diff сущностей
```

Перед коммитом миграции, сгенерированные через `migration:generate`, нужно проверить вручную. Проверено: `lint`, `build`, `test` (74 unit-теста) проходят чисто.

## Архитектура и структура

Монолитный NestJS-процесс. Вход — `src/main.ts`: `bufferLogs`, логгер `nestjs-pino`, shutdown-хуки, порт из `ConfigService`. Корневой `src/app.module.ts` собирает `AppLoggerModule`, `DatabaseModule`, `ShoppingModule`, `AliceModule` и `HealthController`.

```
src/
  config/
    env.ts                 zod-схема env + validateEnv() с понятными ошибками
    configuration.ts       typed-конфиг: registerAs('app') → AppConfigProperties
  common/
    logger.module.ts       AppLoggerModule: ConfigModule (глобальный) + LoggerModule (pino)
  database/
    data-source.ts         standalone DataSource для CLI миграций (entities: src/**/*.entity.ts,
                           migrations: migrations/*.ts) — НЕ используется приложением в рантайме
    database.module.ts     TypeOrmModule.forRootAsync: url из конфига, autoLoadEntities,
                           synchronize: false — строго, схема только через миграции
  shopping/                доменный модуль
    shopping-item.entity.ts    таблица shopping_items (см. ниже)
    normalize.ts               normalizeItemName(): trim, схлопывание \s+ в один пробел, lowercase
    shopping-item.store.ts     интерфейс ShoppingItemStore + DI-токен SHOPPING_ITEM_STORE (Symbol)
                               + DuplicateItemNameError
    typeorm-shopping-item.store.ts   реализация на Repository; pg-ошибку 23505 (unique violation)
                                     переводит в DuplicateItemNameError
    shopping-list.service.ts   доменная логика; возвращает result-union'ы, не кидает HTTP-исключения
    items.controller.ts        служебный REST /items: zod-схема тела, маппинг результатов в HTTP-коды
    shopping.module.ts         TypeOrmModule.forFeature([ShoppingItem]); экспортирует ShoppingListService
                               (точка подключения Alice/Telegram-модулей)
  alice/                   интеграция с Яндекс Диалогами
    alice-protocol.ts          zod-схема запроса Диалогов, тип AliceResponse, сборка ответа
                               (обрезка текста до лимита 1024)
    command-parser.ts          чистый разбор request.command → AliceCommand (add/remove/list/
                               missing-name/unknown): глаголы + имя товара, фразы про список
    alice-responses.ts         маппинг результатов домена в голосовые ответы (тексты, pluralize)
    alice.controller.ts        POST /alice/webhook: валидация тела, проверка session.skill_id
                               (если задан ALICE_SKILL_ID, чужой → 403); пустая команда (запуск
                               навыка) или list-фраза → текущий список; add идёт с source 'alice';
                               unknown/missing-name → подсказка; version эхом
    alice.module.ts            импортирует ShoppingModule (использует ShoppingListService)
  health.controller.ts     GET /health — SELECT 1 в БД; 503 { status: 'db-unavailable' } при сбое
migrations/                SQL-миграции TypeORM, лежат в git (первая: create-shopping-items)
test/                      e2e-спеки (*.e2e-spec.ts) и in-memory store для unit-тестов
```

Сущность `ShoppingItem` (`shopping_items`): `id` bigserial (в коде — строка), `raw_name` text (как ввёл пользователь), `normalized_name` text с **уникальным индексом**, `source` text — `'api' | 'alice' | 'telegram'`, `created_at` timestamptz. Список возвращается в порядке вставки (`createdAt ASC`).

## Доменные правила (не ломать без согласования)

- Имена товаров нормализуются (`trim` + пробелы + lowercase); дубликаты определяются по `normalized_name`, защищённой unique index в БД.
- `add`: повторное добавление отклоняется результатом `already-exists` (HTTP 409). Unique-конфликт БД (23505) обрабатывается как тот же случай, а не как 500.
- `remove`: точное совпадение по normalized-имени удаляется с приоритетом над подстроками; ровно одно подстроковое совпадение (в любую сторону) удаляется; несколько совпадений → `ambiguous` (HTTP 409 со списком вариантов, **ничего не удаляется**); ноль → `not-found` (HTTP 404).

## Соглашения по коду

- **Доменный слой не знает про HTTP.** `ShoppingListService` возвращает дискриминированные union-типы (`{ kind: 'added' | 'already-exists' | ... }`); перевод в HTTP-коды и тела ответов делает только контроллер. Сервис логирует результат каждой операции через дочерний логгер с полем `operation`.
- **Портируемость через интерфейсы + DI-токены.** Доступ к данным — только через интерфейс `ShoppingItemStore` за токеном `SHOPPING_ITEM_STORE`; реализацию легко подменить (так unit-тесты используют `InMemoryShoppingItemStore` из `test/`).
- **Конфигурация строгая.** Всё, что нужно приложению, валидируется zod-схемой (`src/config/env.ts`); с невалидным env приложение не стартует и печатает список проблем. Обращение к конфигу — через `ConfigService<{ app: AppConfigProperties }, true>` с `infer: true`.
- **Тела запросов валидируются zod** в контроллере (`safeParse`), ошибки — 400 с `issues`.
- **Схема БД меняется только миграциями** (`synchronize: false`). Пути в `data-source.ts` относительны корню проекта — команды миграций запускать из корня.
- ESLint-конфиг минимальный (`js.configs.recommended` + `tseslint.configs.recommended`), переопределять без нужды не стоит.

## Git: коммиты и ветки

**Коммиты — строго по [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).**

- Формат заголовка: `<type>[(scope)][!]: <описание>`.
- Типы: `feat` — новая функциональность, `fix` — исправление дефекта; также `refactor`, `chore`, `docs`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- Область (`scope`) необязательна, указывает затронутую часть: `feat(shopping): ...`.
- Описание — на английском, с маленькой буквы, без точки в конце.
- Несовместимые изменения помечаются `!` после типа/области (`feat!: ...`) и/или футером `BREAKING CHANGE: <описание>`; тело и футеры отделяются от заголовка пустой строкой.

**Ветки — по GitHub Flow.**

- `main` — единственная постоянная ветка, всегда в рабочем состоянии (зелёные `lint`, `build`, `test`); напрямую в неё не коммитим.
- Каждое изменение — отдельная ветка от актуального `main`, имя в формате `<type>/<краткое-описание>` в kebab-case: `feat/alice-webhook`, `fix/remove-ambiguous-match`.
- Изменения попадают в `main` только через pull request; перед мерджем PR должен проходить проверки (lint, build, test).
- Ветки короткоживущие: одна ветка — одна задача; после мерджа ветку удаляем.

## Тестирование

- **Unit**: `npm run test` — Jest с `rootDir: src`, файлы `*.spec.ts`, БД не нужна. Доменный сервис тестируется против `InMemoryShoppingItemStore` с логгером уровня `silent`.
- **E2E**: `npm run test:e2e` — конфиг `test/jest-e2e.json` (`rootDir: ..`, файлы `*.e2e-spec.ts`, `testTimeout: 120000`). Testcontainers поднимает `postgres:16-alpine`, миграции применяются отдельным standalone-`DataSource` до создания приложения. Переменные (`DATABASE_URL`, `LOG_LEVEL=error`, `NODE_ENV=test`) выставляются через `process.env` до `createTestingModule`; при `NODE_ENV=test` модуль конфигурации игнорирует `.env`-файлы. Между тестами таблица `shopping_items` чистится SQL-`DELETE`.
- e2e-тестам нужен только Docker: БД создаётся и удаляется автоматически, никакой другой инфраструктуры нет.

## Конфигурация и окружение

Переменные (см. `.env.example`; реальный `.env` в git не коммитится):

| Переменная     | Назначение                                            |
| -------------- | ----------------------------------------------------- |
| `DATABASE_URL` | строка подключения PostgreSQL (`postgres://...`)      |
| `PORT`         | порт HTTP, по умолчанию 3000                          |
| `LOG_LEVEL`    | `debug` / `info` / `warn` / `error`, по умолчанию info |
| `NODE_ENV`     | `development` / `test` / `production`                 |
| `ALICE_SKILL_ID` | необяз.: id навыка из консоли Диалогов; если задан, webhook отвечает 403 на чужой `session.skill_id` |

Файлы `.env.local` и `.env` загружаются по порядку; `IGNORE_ENV_FILE=true` отключает их загрузку. Локальная БД из `docker-compose.yml` опубликована на **порту хоста 5433** (5432 часто занят локальным PostgreSQL). На Windows порты из зарезервированных диапазонов Hyper-V дают `EACCES` — выбирать порт вне них (см. комментарий в `.env.example`).

## Безопасность

- Секреты — только через переменные окружения; `.env` не коммитить, в коде секретов не хранить и не логировать.
- Логер вырезает (redact) чувствительные поля: `authorization`, `x-telegram-bot-api-secret-token`, `set-cookie`, `body.password`, `body.token`, `body.apiKey`.
- Каждый запрос получает `x-request-id` (принимается из заголовка или генерируется) — использовать его при разборе инцидентов.
- REST-контур служебный и не аутентифицирован: не расширять его в публичный API без отдельного решения по безопасности.
- Запросы webhook Алисы Яндексом не подписываются: защита — приватность навыка + опциональная проверка `ALICE_SKILL_ID`. Учтите: HTTPS-туннель для живой приёмки выставляет наружу весь порт, включая служебный `/items`.
