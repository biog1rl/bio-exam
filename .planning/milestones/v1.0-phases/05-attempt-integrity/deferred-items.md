# Deferred items фазы 05

- 05-01: `app/server/src/routes/auth/session-revocation.test.ts` > «смена пароля» > «отзывает остальные сессии пользователя с password_change, текущая продолжает работать» упал по таймауту 5000 мс в одном прогоне `yarn verify` при load average около 10 (параллельно шла фаза 7). Отдельный прогон файла: 11 passed; повторный `yarn verify`: OK. Тест вне файлов фазы, не менялся.
- 05-06: линтер сервера предупреждает о неиспользуемом импорте `appSettings` в `app/server/src/routes/tests/public.ts:16` (no-unused-vars). Предупреждение было до плана, `yarn verify` не валит; импорт не трогался, чтобы не менять файл вне задачи.
- 05-11: `e2e/tests/auth.spec.ts:88` «student logs in and logs out @flow1» на chromium-mobile упал в одном прогоне `yarn e2e`: через 5000 мс страница на `/login`, кнопка «Вход…» disabled. Параллельно шёл Playwright-прогон другого проекта. Повторный полный `yarn e2e`: 132 passed. Тест вне файлов фазы, не менялся.
  status: acknowledged
