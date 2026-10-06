# Отложенные замечания фазы 02

- `yarn workspace @bio-exam/web vitest run …` печатает предупреждение `ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a .mjs extension or set "type": "module" in the closest package.json`. Предупреждение есть и без правок 02-08 (прогон на next-mdx-remote 6 до изменения `app/web/lib/mdx`), тесты не падают. Вне объёма фазы 02.
- `yarn install` печатает `YN0086: Some peer dependencies are incorrectly met by dependencies`. Есть до и после 02-08, к next-mdx-remote 6 не относится.
- S7 (ревью фазы 02): клиентские ошибки multer (`LIMIT_FILE_SIZE`, неверный тип файла и т.п.) отдаются как 500. Тесты 02-02 намеренно закрепляют текущее поведение по D-11; перевод в 4xx — отдельная задача с изменением тестов `app/server/src/routes/uploads.test.ts`.
- S9 (ревью фазы 02): статическая проверка полов версий в `yarn.lock` (next, multer, sharp, next-mdx-remote и т.д. не ниже одобренных) как отдельный шаг `yarn verify`. Укрепление гейта, вне объёма фазы 02.
- CSP с `base-uri 'self'` (и `object-src 'none'`, `script-src` без `unsafe-inline`) для страниц ученика: защита в глубину поверх белого списка `app/web/lib/mdx/remarkMdxAllowlist.ts`. Затрагивает заголовки Next и Vercel, вне объёма фазы 02.
  status: acknowledged
