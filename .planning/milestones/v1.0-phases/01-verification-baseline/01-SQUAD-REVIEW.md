# Squad review — phase 1

- **Дата:** 2026-10-03
- **Планы:** 01-01 … 01-16 (16 планов, 11 волн)
- **Итог:** REVISED (блокер исправлен в единственном цикле правок, открытых блокеров нет)
- **Состав:** plan-critic (gsd-plan-checker, sonnet), code-critic (Explore, opus), risk-critic (general-purpose, opus), devils-advocate (sonnet), ревизия (gsd-planner, sonnet), перепроверка (gsd-plan-checker, sonnet)

## Surviving findings

| id | severity | verdict | evidence | status |
|----|----------|---------|----------|--------|
| C1 (+P1) | BLOCKER | CONFIRMED (P1 — дубликат, понижен и влит в C1) | 01-09:143-147 до правки: Next `webServer` без `env`, `isolatedChildEnv` вырезает `DATABASE_URL`, `@next/env` дозаполняет его из `app/web/.env` (боевой пулер Supabase) и `API_ORIGIN` (dev-порт). `getServerMe.ts:12-25` → `getMeData.ts:92` (pg Pool). Нарушает D-17 и запрет 01-09:60 | fixed — `scripts/lib/e2e-web-env.mjs` (`buildWebEnv`, `assertWebEnvClosed`, `--check` перед `next build` и в команде `next start`), node:test с приманкой `.env`, `NODE_ENV=development` только для Express (01-09:176-205) |
| P2 (= C4) | MAJOR | CONFIRMED | 01-10:105 `git ls-files --cached` видит неиндексированное удаление `package-lock.json` (проверено в scratch-репозитории) → `check-lockfile` и `yarn verify` красные до коммита в 01-14 | fixed — `existingPaths(paths, fs.existsSync)` + кейсы node:test (01-10:103-125, 155) |
| C2 | MAJOR | CONFIRMED | `packages/rbac/dist` в `.gitignore:15`, сид e2e импортирует `@bio-exam/rbac` до сборки rbac (01-09:109/114 vs 143), в CI e2e-джобе сборки нет | fixed — сборка rbac в `scripts/e2e.mjs` до `withTestDatabase`, проверка `rm -rf packages/rbac/dist; yarn e2e --seed-only` (01-09:131, 142-143) |
| C3 | MAJOR | CONFIRMED | `tsx -e "await import(...)"` компилируется в CJS и всегда падает с ошибкой top-level await (tsx 4.21.0, эксперимент) — проверка guard в `drizzle.config.ts` была пустой | fixed — форма `import(...).then(exit 0, exit 3)`, негативный (`db.example.invalid`, exit 3 + текст guard) и позитивный (`127.0.0.1/test_x`, exit 0) контроль в 01-01, 01-08 и VALIDATION.md:68 |
| C8 | MINOR | не рассматривался | `schema.ts:46` `isActive` по умолчанию false, `login.ts:101-102` → 403 | fixed — сид создаёт пользователей с `isActive: true` |
| C5 | MINOR | не рассматривался | очистка сирот удаляет каталог параллельного запуска до появления `postmaster.pid` | fixed — `owner.pid` сразу после `mkdtemp`, удаление только при мёртвых PID или старше 10 минут |
| C6 | MINOR | не рассматривался | env-contract счёл бы `BIO_EXAM_ISOLATED_ENV` неиспользуемым | fixed — `BIO_EXAM_ISOLATED_ENV` и `TEST_DATABASE_URL` в allowlist с причиной |
| C7 | MINOR | не рассматривался | `app/web/.vscode/settings.json` ссылается на удаляемый `.prettierrc.json`, `.prettierignore` осиротеют | fixed — prettier-ключи убраны, `.prettierignore` удалены, записи перенесены в `.oxfmtrc.json` |
| R2 | MINOR | не рассматривался | новый `deploy` запускал бы `oxfmt .` на запись перед `vercel --prod` | fixed — `format:check` |
| R1 | MINOR | не рассматривался | всё лежит незакоммиченным до волны 10, первый деплой из master несёт все изменения разом | fixed (только рекомендации в 01-14 T1) — коммиты по планам, сначала ветка + PR для CI и Vercel preview, откат через Vercel Instant Rollback |
| P3 | MINOR | не рассматривался | `test.fail()` проходит на любой ошибке, включая сломанный сетап | fixed — сетап D1/D2/D5 вынесен из `test.fail()` |
| R3 | MINOR | не рассматривался | ни один гейт не запускает продовую (неизолированную) ветку старта сервера | open — кандидат после первого прогона CI: smoke-запуск `app/server/dist` с `NODE_ENV=production`, `127.0.0.1/test_ci` и curl `/healthz` |

## Refuted

- Полностью опровергнутых нет.
- P1 — механизм подтверждён, но реального подключения pg к боевой базе сейчас нет (в `app/web/.env` задан `API_ORIGIN`, SSR уходит в fetch). Понижен и влит в C1.
- Под-пункт C1 про `NODE_ENV=development` в `next build` — UNVERIFIABLE без сборки (Next только предупреждает), закрыт той же правкой.

## Revision

Один цикл (gsd-planner, sonnet), правки в 01-01, 01-06, 01-08, 01-09, 01-10, 01-11, 01-13, 01-14, 01-15 и 01-VALIDATION.md. Волны и `depends_on` не менялись, задач не убавилось. Также исправлен `testDir` Playwright (`'.'` + `testMatch` по проектам), `e2e/tests/auth.spec.ts` и `.gitignore` перенесены из 01-09 T2 в T3, оценка 01-09 выросла до 115k. Перепроверка (gsd-plan-checker): C1, P2, C2, C3 — FIXED, регрессий нет, Result: PASSED. Ничего не закоммичено.
