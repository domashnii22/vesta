# AGENTS.md — Vesta

Семейное PWA для общего списка продуктов (аналог Bring). Стек: NestJS + TypeORM + PostgreSQL (`backend/`), React 19 + Vite (`frontend/`). Только free-tier инфраструктура.

## Текущее состояние

Репозиторий — ранний скаффолд, а не готовая фича. Не считай целевую архитектуру уже реализованной:

- backend: только `GET /health`, TypeORM и ConfigModule, `synchronize: true`; модулей auth/users/products ещё нет.
- frontend: дефолтный Vite-шаблон (`src/App.tsx`); Mantine, FSD-слоёв, роутера, PWA и тестов ещё нет.
- `specs/` ещё не создан.

## Команды

Корневого `package.json`/workspace нет — два независимых npm-проекта. Запускай команды из `backend/` или `frontend/`.

Backend:

- `npm run start:dev` — Nest watch
- `npm run build` — `nest build` (сборка не проверяет запуск приложения)
- `npm run lint` — eslint **с `--fix`** (меняет файлы)
- `npm test` / `npm run test:e2e`

Frontend:

- `npm run dev`
- `npm run build` — `tsc -b && vite build` (ошибки типов ломают сборку)
- `npm run lint` — eslint без `--fix`
- тестового раннера нет

БД: `docker compose up -d db` (контейнер `vesta-db`, порт 5432). Учётные данные в `docker-compose.yml` должны совпадать с `backend/.env`; backend читает `.env` из своей директории.

## Известные проблемы (проверено)

- `backend/package.json` содержит `@nestjs/config@^12.0.1`. 12.x — ESM-only, а backend собирается в CommonJS: `node dist/main.js` и e2e падают с `ERR_REQUIRE_ESM`. Нужен `@nestjs/config@4.x` (Node 20). `nest build` при этом проходит — не обманывайся.
- Стартерные тесты устарели: `src/app.controller.spec.ts` импортирует несуществующий `app.service`/`getHello()`, а e2e ждёт `GET /` → `Hello World!` (на деле есть только `/health`). Поэтому `npm test` и `npm run test:e2e` красные, а backend lint падает из-за этого spec.
- Vite 8 требует Node 20.19+ или 22.12+, в окружении 20.17.0 — сборка идёт с предупреждением.
- `frontend` зависит от `@rolldown/binding-linux-x64-gnu` (обходной путь для WSL/Linux) — не удалять.

## Backend

- Вывод CommonJS, хотя `tsconfig` использует `module: nodenext` (`package.json` без `"type": "module"`). Не переключай на ESM и не добавляй ESM-only зависимости.
- Алиас путей: `@src/*` → `./src/*` (без `baseUrl`), не `@app/*`.
- TS не полностью strict: `noImplicitAny: false`, включён только `strictNullChecks`.
- CORS в `src/main.ts` разрешает только `localhost:5173` и `127.0.0.1:5173`; при смене порта Vite обнови список.
- TypeORM: поля сущностей с `!`, имена таблиц/колонок snake_case через `@Entity`/`@Column({ name })`.
- `synchronize: true` — только dev; перед prod перейти на миграции.
- Секреты только в `.env` (не коммитится), в коде — через `ConfigService`/`process.env`.
- Новый модуль = отдельный NestJS-модуль; контроллер тонкий, логика в сервисе; DTO валидировать через class-validator/class-transformer.
- nestjs-pino и `/metrics` заявлены в плане, но пока не подключены.

## Frontend

- Целевая архитектура — FSD (`app/pages/widgets/features/entities/shared`): импорт только вниз по слоям, между слайсами одного слоя нельзя, публичный API через `index.ts`. UI — Mantine, mobile-first, тап-зоны ≥ 44×44px.
- Компилятор жёсткий: `verbatimModuleSyntax` (type-only импорты обязательны), `erasableSyntaxOnly` (нельзя enum/namespace/parameter properties), `noUnusedLocals`/`noUnusedParameters`.
- Версии очень свежие: React 19.3, Vite 8, TypeScript 6, ESLint 10 — не понижай без причины.
- Любой запрос к API обрабатывает loading / error (+ повтор) / empty / success.

## SDD и Git

- Фичи: `specs/<NNN>-<feature>/{spec,plan,tasks}.md`; код строго по spec/plan, изменение поведения — через обновление спеки.
- Ветка `feature/<NNN>-<short-name>`, коммит `<type>(<scope>): <description>`.
- Ворота перед коммитом: backend lint + build, frontend lint + build, ручной mobile smoke-test.
- При неоднозначности — спросить, не додумывать.

## Красные линии

- Не коммитить `.env` и секреты.
- Не использовать `--legacy-peer-deps`.
- Не поднимать `@nestjs/config` до 12.x на Node 20 / CommonJS.
- Не включать `synchronize: true` в production.
- YAGNI: никакого кода «на будущее».
- Никаких платных сервисов; роли и разрешения — только после отдельной спецификации.
