# Decisions (from ADR sources)

Synthesized from 5 ADR-classified documents. All five are locked (status Accepted, dated 2026-10-02, manifest precedence 0). No two locked ADRs contradict each other. Source text is preserved in the original language (Russian).

## ADR-0001: Express владеет базой и политикой доступа, Next только показывает UI
- source: /Users/kdvornichenko/bio-exam/docs/adr/0001-express-owns-data-and-access-policy.md
- status: locked (Accepted)
- decision:
  - **База, токены и права живут только в `app/server`.** Обращения к PostgreSQL, выпуск и проверка JWT и вычисление эффективных прав есть только там. Эффективные права считаются одним модулем от ролей и overrides. Все проверки Express и `/api/auth/me` идут через него.
  - **Next ходит только в Express.** `app/web` получает текущего пользователя и его права по HTTP из `/api/auth/me` и только проверяет готовый список прав. В `app/web` нет `pg`, `jsonwebtoken`, `DATABASE_URL` и `AUTH_JWT_SECRET`.
  - **`packages/rbac` остаётся словарём.** В нём реестр ролей, доменов и действий. Второго алгоритма вычисления прав рядом с серверным не появляется.
  - Рассмотренный и отклонённый вариант: перенос API в route handlers или server actions Next (в Express 103 обработчика, переносить без выигрыша).
  - Последствия: удаляются `getMeData`, `app/web/app/api/auth/me/route.ts` и пул `pg` в Next. Server rendering должен уметь обновлять сессию через refresh (один модуль веб-сессии: кто текущий пользователь, 401 → refresh → retry, редирект на логин). UI берёт гейты маршрутов из тех же прав, что проверяет Express; своих обходов `isAdmin` и проверок по строкам ролей в React нет.
- scope: RBAC, database ownership, JWT tokens, Express, Next, access control

## ADR-0002: Доменная логика экзамена живёт в общем пакете `packages/exam-core`
- source: /Users/kdvornichenko/bio-exam/docs/adr/0002-shared-exam-core-package.md
- status: locked (Accepted)
- decision:
  - **Пакет `packages/exam-core`.** Это чистый TypeScript, из зависимостей только `zod`. Пакет собирается так же, как `@bio-exam/rbac`.
  - **Один адаптер на шаблон вопроса:** `single_choice`, `multi_choice`, `matching`, `short_text`, `sequence_digits`. Каждый адаптер отвечает за форму ключа и её проверку при авторинге, форму ответа, «отвечено ли», нормализацию, подсчёт ошибок и вердикты по частям для экрана разбора.
  - **Контракты.** В пакете объявлен формат результата попытки (zod-схема) и слияние телеметрии. Всё, что пересекает HTTP между `app/web` и `app/server`, объявляется в пакете и импортируется, а не копируется.
  - **Кто использует пакет.** Редактор вопросов, прохождение теста, разбор попытки и сервер (валидация при сохранении и оценка при submit) работают через него.
  - Последствия: тесты пакета табличные ((ключ, ответ) → оценка и вердикты по частям, плюс инвариант «все части верны ⇔ ошибок 0»); пакет не тянет React, Lexical, Drizzle или Tiptap.
- scope: packages/exam-core, exam templates, domain logic, TypeScript, zod, single_choice, multi_choice, matching, short_text, sequence_digits, app/web, app/server

## ADR-0003: Сначала проверки, потом рефакторинг
- source: /Users/kdvornichenko/bio-exam/docs/adr/0003-verification-before-refactoring.md
- status: locked (Accepted)
- decision:
  - **Проверки.** Vitest во всех workspace, корневой `yarn verify` (lint, typecheck и test) и CI на каждый pull request.
  - **Один менеджер пакетов.** Остаётся Yarn 4, `package-lock.json` удаляется.
  - **Порядок с Drizzle.** Метаданные Drizzle восстанавливаются до любой новой миграции.
  - **Рефакторинг с тестов.** Изменение модулей из ADR-0001, 0002, 0004 и 0005 начинается с характеризационных тестов, которые идут через интерфейс модуля, а не мимо него.
  - Последствия: планы 001 и 009 становятся первой фазой. Остальные фазы опираются на `yarn verify` как на обязательное условие.
- scope: verification, testing, Vitest, CI/CD, package management, Yarn, refactoring, Drizzle, test infrastructure

## ADR-0004: Хранилище файлов: один интерфейс, два адаптера
- source: /Users/kdvornichenko/bio-exam/docs/adr/0004-storage-port-two-adapters.md
- status: locked (Accepted)
- decision:
  - **Одна точка доступа.** Модуль хранилища — единственное место, через которое идёт работа с файлами.
  - **Два адаптера.** Supabase используется сейчас, локальный том нужен для VPS.
  - **Логика внутри модуля.** Нормализация ключей, проверка, что путь не выходит за корень (containment), правило «ключ → URL» и единые режимы ошибок живут в модуле.
  - **Маршруты** не трогают `fs` и не считают пути.
  - **Web** получает готовые URL от API и не знает, как разложены файлы в хранилище.
  - **Тесты.** Один контрактный набор тестов прогоняется на обоих адаптерах.
  - Последствия: переезд на VPS сводится к включению второго адаптера; защита от выхода за корень (план 006) и потоковый ZIP (план 008) реализуются один раз внутри модуля.
- scope: storage module, Supabase adapter, local disk adapter, routes, VPS, containment checking, key normalization

## ADR-0005: Делить код по понятиям, а не по маршрутам и типам данных
- source: /Users/kdvornichenko/bio-exam/docs/adr/0005-decompose-by-concept.md
- status: locked (Accepted)
- decision:
  - Сначала выделяются глубокие модули по понятиям, а нарезка роутера по маршрутам делается после, поверх них:
    - **Содержимое вопроса** (сервер). Строка в БД, версии ключа ответа, файлы промпта и пояснения, документ поиска, раскладка путей от slug и непрерывный порядок вопросов. Отвечает за создание, правку, перенос, удаление и чтение.
    - **Оценённая попытка** (сервер). При submit сохраняются факты оценки: ключ, по которому оценивали, ошибки и вердикты по частям. Что показать конкретному зрителю (студенту с ключом, студенту без ключа, администратору), вычисляется при чтении. Подставлять текущий ключ в старую попытку запрещено.
    - **Жизненный цикл попытки** (клиент). Фазы и события: старт, ответ, переход, вкладка скрыта или видна, тик таймера, отправка, пересдача. Модуль отвечает за формат локального черновика, телеметрию и сброс при пересдаче.
  - Этот ADR заменяет шаг 3 плана 010: `TestRunner` не делится на четыре хука.
  - Последствия: шаг декомпозиции роутера из плана 010 выполняется после модулей «содержимое вопроса» и «оценённая попытка»; модуль «оценённая попытка» делается вместе с планом 004, потому что меняет то, что записывает транзакция submit.
- scope: code organization, module decomposition, question content, test attempt lifecycle, routing
