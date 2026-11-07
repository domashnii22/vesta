# AGENTS.md — Конституция проекта «Vesta»

## 1. Обзор проекта

Vesta — семейное PWA-приложение для совместного ведения списка продуктов (аналог Bring). На текущем этапе: простая регистрация и авторизация по email/паролю, минимальные данные пользователя (ФИО), один общий список продуктов. Роли и разрешения **не реализуются** на этом этапе.

**Ключевые принципы:**

- Mobile-first UI: интерфейс проектируется в первую очередь для телефона.
- Бесплатная инфраструктура: никаких платных API, только free-tier сервисы.
- Spec-Driven Development (SDD): код пишется строго по утверждённым спецификациям.

## 2. Технологический стек

**Фронтенд (`frontend/`)**

- React 19 + Vite (TypeScript, strict mode)
- **Mantine** — UI-библиотека (mobile-first, встроенная темизация, формы, адаптивные компоненты)
- **FSD (Feature-Sliced Design)** — архитектура фронтенда (см. раздел 6)
- PWA (manifest + service worker) для установки на главный экран
- Web Push (VAPID) для бесплатных пуш-уведомлений

**Бэкенд (`backend/`)**

- NestJS (CommonJS)
- TypeORM + драйвер `pg`
- PostgreSQL 17 (в Docker)
- `@nestjs/config` версии 4.x (НЕ 12.x — 12.x является ESM-only и требует Node.js 22.12+)
- **JWT-аутентификация**: `@nestjs/jwt`, `passport-jwt`, `bcrypt`
- **Логи**: `nestjs-pino` (структурированные JSON-логи)
- **Метрики**: `@willsoto/nestjs-prometheus` + `prom-client` (эндпоинт `/metrics`)

**Окружение**

- Node.js 20.17+ (текущая версия разработки)
- WSL (Ubuntu) — все команды выполняются внутри WSL, не в PowerShell/CMD
- Docker Desktop с интеграцией WSL 2

## 3. Структура репозитория

vesta/
├── backend/ # NestJS API
│ ├── src/
│ │ ├── main.ts # bootstrap, CORS, логгер
│ │ ├── app.module.ts # TypeORM forRoot, Prometheus, Pino
│ │ ├── auth/ # регистрация, логин, JWT-стратегия
│ │ ├── users/ # сущность User (ФИО, email, passwordHash)
│ │ └── products/ # сущность Product, CRUD
│ └── .env # НЕ КОММИТИТЬ
├── frontend/ # React + Vite PWA
│ └── src/
│ ├── app/ # провайдеры, роутер, глобальные стили
│ ├── pages/ # страницы (login, register, products)
│ ├── widgets/ # независимые блоки (Header, Layout)
│ ├── features/ # сценарии (auth, product-list)
│ ├── entities/ # сущности (user, product)
│ └── shared/ # UI-kit (Mantine), API-клиент, утилиты
├── specs/ # SDD-артефакты
│ └── 001-<feature>/
│ ├── spec.md
│ ├── plan.md
│ └── tasks.md
├── docker-compose.yml # PostgreSQL
├── AGENTS.md # этот файл
└── .gitignore

text

## 4. SDD-процесс (обязателен для всех фич)

Любая новая функциональность проходит пять фаз. Артефакты хранятся в `specs/<NNN>-<feature>/` и версионируются в git.

1. **Specify** → `spec.md`. Только пользовательские сценарии и требования. Никакой техники, названий файлов и технологий.
2. **Plan** → `plan.md`. Техническая реализация: эндпоинты, сущности, DTO, компоненты, миграции.
3. **Tasks** → `tasks.md`. Чек-лист атомарных задач, каждая — не больше одного файла/модуля.
4. **Implement**. Код пишется строго по утверждённым `spec.md` и `plan.md`. Код, не соответствующий спецификации, считается багом.
5. **Verify**. Ручной smoke-test + `npm run build` + `npm run lint`. Только после этого — коммит.

**Правило:** ни один PR не принимается без ссылки на `specs/<NNN>/spec.md`. Изменение поведения системы требует обновления спецификации.

## 5. Правила для бэкенда (NestJS + TypeORM)

### Сущности TypeORM

- Все поля, заполняемые ORM, использовать с definite assignment assertion (`!`):
  ```typescript
  @PrimaryGeneratedColumn()
  id!: number;
  Имена таблиц и колонок — в snake_case через @Entity('table_name') и @Column({ name: 'column_name' }).
  ```

Не использовать synchronize: true в production. В dev — можно, но перед деплоем перейти на миграции.

### Аутентификация

- Регистрация и логин — через AuthModule с @nestjs/jwt и passport-jwt.
- Пароли хешировать через bcrypt (salt rounds ≥ 10).
- Сущность User: id, email (unique), passwordHash, fullName (ФИО), createdAt.
- Эндпоинты POST /auth/register и POST /auth/login — публичные.
- Все остальные эндпоинты защищены JwtAuthGuard.
- JWT передаётся в заголовке Authorization: Bearer <token>.

### Модули

- Каждая фича — отдельный модуль NestJS (AuthModule, UsersModule, ProductsModule).
- Контроллеры — тонкие: только приём запроса и вызов сервиса.
- Сервисы — вся бизнес-логика.
- DTO с валидацией через class-validator и class-transformer.
- CORS (критично)
- В main.ts всегда разрешать оба origin фронтенда:

typescript
app.enableCors({
origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
credentials: true,
});
При смене порта Vite (если 5173 занят) — обновить список.

### Конфигурация

- Все секреты и строки подключения — только в .env.
- В коде — только process.env.\* через ConfigService.
- @nestjs/config версии 4.x. Не обновлять до 12.x без обновления Node.js до 22.12+.
- TypeScript
  baseUrl в tsconfig.json — удалить, использовать paths с префиксом ./:
- json
  "paths": { "@app/_": ["./src/_"] }
  Не использовать any. Для сложных типов — unknown + type guard.

## 6. Правила для фронтенда (React + FSD + Mantine)

### Архитектура FSD

Код организуется по слоям (сверху вниз — от самого специфичного к самому общему):

- app/ — провайдеры (MantineProvider, Router), глобальные стили, точка входа.
- pages/ — страницы (1:1 с маршрутами): login, register, products.
- widgets/ — независимые UI-блоки (Header, Layout).
- features/ — пользовательские сценарии (auth, product-list, product-create).
- entities/ — бизнес-сущности (user, product): типы, UI-карточки, API-запросы.
- shared/ — переиспользуемое: UI-kit на Mantine, API-клиент, утилиты.

### Правила зависимостей:

- Слой может импортировать только слои ниже себя. pages → features → entities → shared. Обратное запрещено.
- Слайсы внутри одного слоя не могут импортировать друг друга.
- Каждый слайс экспортирует публичный API через index.ts.

### UI (Mantine)

- Mobile-first: сначала стили для телефона, потом @media (min-width: 768px).
- Все интерактивные элементы — с минимальным размером 44×44px (тап-зона).
- Для форм использовать @mantine/form, для уведомлений — @mantine/notifications.

### Состояния загрузки

Любой запрос к API должен обрабатывать четыре состояния:

- loading — скелетон или спиннер.
- error — понятное сообщение + кнопка «Повторить».
- empty — заглушка «Пока ничего нет».
- success — отрисовка данных.

### PWA

- Манифест — public/manifest.webmanifest.
- Service worker — через vite-plugin-pwa.
- Для iOS: явно показывать подсказку «Добавить на экран «Домой»» — без этого пуши не работают.

## 7. Аутентификация и пользователи (без ролей)

- Все пользователи равноправны. Роли и разрешения не реализуются.
- Каждый пользователь видит и редактирует свой список продуктов (привязка по userId).
- JWT-токен хранится на клиенте (в localStorage или memory). При истечении — перенаправление на /login.

## 8. Логирование и метрики

### Логи

- Использовать nestjs-pino. Логи — в формате JSON, с полями level, time, msg, context.
- В dev — pino-pretty для читаемого вывода.
- В production — отправка логов во внешний сервис (Axiom, Render logs).

### Метрики

- Подключить @willsoto/nestjs-prometheus в AppModule. Эндпоинт /metrics доступен для сбора Prometheus.
- Собирать стандартные метрики Node.js (CPU, память) и HTTP-метрики (RPS, latency, коды ответов).
- Не добавлять кастомные бизнес-метрики без явной необходимости в спецификации.

## 9. Валидационные ворота (после каждой задачи)

- cd backend && npm run lint — без ошибок
- cd backend && npm run build — собирается
- cd frontend && npm run lint — без ошибок
- cd frontend && npm run build — собирается
- Ручной smoke-test в браузере на мобильном разрешении (Chrome DevTools, iPhone 12)
- Если менялась схема БД — проверено через psql \dt или \d <table>

## 10. Git

- Ветка на фичу: feature/<NNN>-<short-name> (например, feature/001-auth).
- Формат коммитов: <type>(<scope>): <description>
- Примеры: feat(auth): add JWT registration, fix(products): correct userId filter.
- Коммит делается только после прохождения валидационных ворот.
- .env, node_modules/, dist/ — в .gitignore.

## 11. Красные линии (никогда не делать)

❌ Коммитить .env или любые секреты.

❌ Использовать --legacy-peer-deps для обхода конфликтов зависимостей.

❌ Обновлять @nestjs/config до 12.x без обновления Node.js до 22.12+.

❌ Включать synchronize: true в production.

❌ Писать код «на будущее» (YAGNI). Только то, что есть в текущей спецификации.

❌ Добавлять платные сервисы (Stripe, Twilio, платные push-сервисы).

❌ Реализовывать роли и разрешения, пока это не описано в отдельной спецификации.

## 12. Деплой и наблюдаемость (план)

### Деплой (бесплатные тарифы):

- Бэкенд + БД: Render или Railway (free tier).
- Фронтенд: Vercel или Netlify (free tier).

### Наблюдаемость:

- Логи: nestjs-pino → Axiom (free tier до 0.5 ТБ) или встроенный лог-сервис Render.
- Метрики: Prometheus-эндпоинт /metrics. На free-tier хостингах можно подключить внешний сборщик (Grafana Cloud free tier).
- Health-check: GET /health — используется при деплое для проверки живости.

## 13. Работа с агентами

- Агент-аналитик (@analyst) — read-only, создаёт spec.md и plan.md.
- Агент-разработчик (@developer) — пишет код строго по tasks.md.
- Агент-ревьюер (@reviewer) — проверяет соответствие кода спецификации.
- Оркестратор (@orchestrator) — координирует работу, не пишет код.
- При любой неоднозначности — остановиться и спросить пользователя, не додумывать.
