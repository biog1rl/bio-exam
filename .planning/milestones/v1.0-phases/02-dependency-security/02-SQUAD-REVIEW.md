# Squad review — phase 2

- Дата: 2026-10-03
- Планы: 02-01 … 02-09
- Критики: plan-critic (gsd-plan-checker), code-critic (Explore), risk-critic (general-purpose); затем devils-advocate; один цикл ревизии gsd-planner; перепроверка gsd-plan-checker
- Outcome: **REVISED** (открытых BLOCKER нет)

Поднято 19 находок: 1 BLOCKER, 9 MAJOR, 9 MINOR. После слияния дублей (P6 = C6, R5 = C5, R7 = C4) уникальных 16. Devils-advocate проверял 10 BLOCKER/MAJOR, в том числе прогоном настоящего MDX-конвейера на next-mdx-remote 5.0.0 и 6.0.0 (опубликованный tarball, без установки в проект). Опровергнутых целиком нет, 6 понижены до MINOR. Исправлено 16 из 16 и одно предупреждение перепроверки. Открыт один INFO.

## Surviving findings

| id | severity | verdict | evidence | status |
|---|---|---|---|---|
| C1 | BLOCKER | CONFIRMED | `node_modules/next-mdx-remote/dist/serialize.js:11,16`; `app/web/lib/mdx/options.ts:16-23`. На v5 `import`/`export` вырезает `removeImportsExportsPlugin`. Красные 1, 2, 5, 6, 7; зелёные 3, 4, 8, 9. Условие «1 и 3 красные, иначе STOP» срабатывало на исправном конвейере | fixed: 02-01 обязательный красный набор {1, 2, 5}, 6 и 7 `test.fails` по факту, 3 и 4 обычные `test`; 02-08 матрица 1, 2, 5 — blockJS; 6, 7 — `remarkStripUnsafeJsx`; 3, 4, 8, 9 зелёные на обеих версиях |
| C2 | MAJOR | CONFIRMED | v6 `dist/serialize.js:18-21`, `dist/plugins/remove-javascript-expressions.js:41`; `remarkMdxStyleToEstree.ts:89-97`. В v6 style вырезается всегда | fixed: 02-08 Task 1 переносит `remarkMdxStyleToEstree` в `rehypePlugins` после `rehypeRaw` (проверено прогоном: вывод байт-в-байт как на v5); автоматическая проверка порядка |
| R1 | MAJOR | CONFIRMED | `app/server/api/index.ts:17`, `app/server/vercel.json:10`, импорт sharp на верхнем уровне `routes/users/avatar.ts:8`, `routes/docs/assets.ts:7`; у `sharp@0.35.5` нет install-скрипта | fixed: 02-07 Task 2 обязательный `GET <server-preview>/healthz` → `{"ok":true}`, 500 или «Could not load the "sharp" module» = STOP; уточнён шаг с аватаром; 02-04 больше не обещает install-скрипт |
| R4 | MAJOR | CONFIRMED | 02-06:96 (`<8`), 02-07:103 (`c<4`): проверки «не ниже» пропускали неодобренный патч | fixed: блок `## approved-versions` в 02-04-SUMMARY; сверка установленной версии на равенство в 02-05…02-08, расхождение → блокирующий checkpoint; дельта `yarn.lock` и YN0007 в SUMMARY каждой группы; манифест остаётся `^` (D-02) |
| P1 | MINOR | DOWNGRADED | 02-01:23; на v6 по умолчанию ничего не бросает | fixed: поле `compiled` у пейлоадов, на v6 `compiled === true` для компилировавшихся на v5 |
| P2 | MINOR | DOWNGRADED | `\{x\}` даёт `{x}` на v5 и v6 | fixed: эталон в `LEGIT_FIXTURES` |
| R3 | MINOR | DOWNGRADED | `{2}`, `{' '}`, `{"{"}`, `style={{…}}` меняются на v6; это изменение, принятое D-08; v6 не бросает | fixed: отдельный массив `EXPRESSION_CONTENT` с выводом v5, в 02-08 переключается на v6 и записывается как изменение по D-08; обход blockJS через AST не делается (D-08); на preview пользователь ищет тексты с `{` |
| P3 | MINOR | DOWNGRADED | `untrusted.test.ts` не защищён до коммита на 02-07 | fixed: sha256 в 02-01-SUMMARY, сверка в 02-05, 02-06, 02-07 |
| P4 | MINOR | DOWNGRADED | спека proxy до 02-07 не в git | fixed: сырой и нормализованный sha256 в 02-03-SUMMARY, сверка в 02-06; инварианты `PUBLIC_PATHS`, `PUBLIC_PREFIXES`, `isPublicPath`, `callbackUrl`, matcher сверяются с HEAD |
| R2 | MINOR | DOWNGRADED | выкатка в прод вне границ фазы | fixed: в 02-09 Task 3 правило отката по классу сбоя (server — откат только server; MDX — `git revert` коммитов 02-08; Instant Rollback web — только при сбое самого Next) |
| C3 | MINOR | не проверялся DA | FK `user_roles.role_key` → `roles.key`, `schema.ts:113-115` | fixed: сид `roles` с `onConflictDoNothing()` перед `userRoles` в 02-02 |
| C4 (= R7) | MINOR | не проверялся DA | `new URL('//dashboard', base)` → `http://dashboard/` | fixed: абсолютный URL `${baseURL}//dashboard` в 02-03 |
| C5 (= R5) | MINOR | не проверялся DA | у sharp 0.35.x и `@img/*` нет lifecycle-скриптов | fixed: ориентир checkpoint в 02-04 исправлен, появление install-скрипта = стоп |
| C6 (= P6) | MINOR | не проверялся DA | React 19 подменяет `javascript:`-URL, mdast `link` плагин не видит | fixed: формулировка в 02-08 Task 2, пейлоад 9 закрывает React |
| R6 | MINOR | не проверялся DA | `avatar.ts:199` удаляет прежние файлы аватара | fixed: в 02-07 проверить окружение Preview, при боевых данных грузить только тестовой учёткой (T-2-24) |
| P5 | MINOR | не проверялся DA | зелёные на v5 пейлоады без пробы ассерта | fixed: проба инверсии для 3, 4, 8, 9 в 02-01 |
| RV-1 | WARNING | новая находка перепроверки | 02-05 и 02-06 с `autonomous: true` при условном блокирующем checkpoint | fixed: `autonomous: false`, к checkpoint добавлено «не авто-одобряется, workflow.auto_advance игнорируется» |
| RV-2 | INFO | новая находка перепроверки | 02-05:114: checkpoint на любую версию транзитива `yarn up -R` вне таблицы строже, чем в 02-06…02-08 | open (консервативно, на цель фазы не влияет) |

## Refuted

Целиком опровергнутых находок нет. Опровергнуты отдельные утверждения:
- R3: «v6 бросает на таком исходнике → `MdxRenderer` показывает сырой MDX». Не бросает, все 9 пейлоадов `compiled: true`.
- R4: «sharp 0.35.6 встанет до одобрения sharp в 02-07». Sharp одобряется в таблице 02-04, риск только в версии новее одобренной.
- R1: «как направить web-preview на server-preview, не сказано». Способ в 02-07 был, но расплывчатый.

Отклонены предложенные исправления, противоречащие решениям пользователя:
- пропуск объектного `style={{…}}` через проверку AST (D-08);
- точный пин версий в манифесте (D-02).

## Revision

- 02-01: красный набор {1, 2, 5}, поле `compiled`, `\{x\}`, `EXPRESSION_CONTENT`, sha256 теста, проба ассерта.
- 02-02: сид `roles`.
- 02-03: `${baseURL}//dashboard`, два хеша спеки.
- 02-04: `## approved-versions`, ориентир lifecycle-скриптов sharp.
- 02-05, 02-06, 02-07, 02-08: сверка версий на равенство одобренным, база lockfile и лог yarn, дельта `yarn.lock` и YN0007 в SUMMARY.
- 02-05, 02-06, 02-07: сверка sha256 теста MDX.
- 02-05, 02-06: `autonomous: false`.
- 02-06: сверка спеки proxy по хешам и инварианты `proxy.ts`.
- 02-07: `/healthz` вместо поиска install в логе, аватар на Preview только тестовой учёткой.
- 02-08: матрица v5→v6 с колонкой `compiled`, `remarkMdxStyleToEstree` в `rehypePlugins`, `remarkStripUnsafeJsx` обязателен, формулировка про `javascript:`, подсказка искать `{` на preview.
- 02-09: правило отката по классу сбоя.

Волны и `depends_on` не менялись. Все 9 планов проходят `frontmatter.validate --schema plan` и `verify.plan-structure` без ошибок и предупреждений. У каждой из 87 `<automated>`-команд есть `<fails_when>`.
