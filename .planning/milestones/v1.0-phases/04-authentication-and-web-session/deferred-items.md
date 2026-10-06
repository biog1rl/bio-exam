# Отложенные находки фазы 4

## 04-06: заголовок Cookie в логе ошибок запроса

- Где: `app/server/src/lib/logger.ts` (`pinoHttp` без `redact`), `app/server/src/app.ts` (`errorHandler` пишет `req` в `log.error`).
- Что: при любой ошибке запроса (4xx/5xx через `errorHandler`) в лог попадает `req.headers.cookie` целиком, то есть значения `bio_exam_session` и `refresh_token`. Видно в выводе `vitest` (`"cookie":"bio_exam_session=eyJ…"`).
- Почему не исправлено в 04-06: файлы вне `files_modified` плана, поведение существовало до плана; модуль `services/session` и маршруты `login`/`refresh`/`logout` сами токены не пишут, а ошибки БД модуля (`SessionStoreError`) не несут параметров запроса.
- Предлагаемая правка: `redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '[redacted]' }` в `pinoHttp` (и в `pino`, если `req` логируется напрямую); тест, что строка лога ошибки не содержит значения cookie.
  status: acknowledged

## 04-07: строка `refresh_replay` несёт заголовок Cookie

- Где: `app/server/src/routes/auth/refresh.ts` (`req.log?.warn?.({ userId, sessionId, event: 'refresh_replay' }, …)`).
- Что: `req.log` — дочерний логгер `pinoHttp` с привязкой `req`, поэтому строка события replay, кроме `userId`, `sessionId`, `event`, содержит `req.headers.cookie` со значениями `bio_exam_session` и повторённого `refresh_token`.
- Правка `redact` из пункта 04-06 закрывает и эту строку; тест после правки: строка `refresh_replay` не содержит значений cookie.
  status: acknowledged

## 04-12: картинка страницы 404

- Где: `app/web/app/not-found.tsx` (`<Image src="/img/not-found.png">`), `app/web/public/img/`.
- Что: файла `public/img/not-found.png` нет; при каждом показе 404 сервер Next пишет `The requested resource isn't a valid image for /img/not-found.png received null`, картинка на странице не отображается. Текст `PAGE NOT FOUND` и кнопка работают.
- Почему не исправлено в 04-12: план запрещает менять `app/not-found.tsx`; поведение существовало до плана.
  status: acknowledged

## 04-12: неиспользуемые переменные в DashboardClient

- Где: `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx` (`adminStudentChartConfig`, `studentProgress`, `groupedTests`, `adminStudentScores`).
- Что: предупреждения oxlint `no-unused-vars`; существовали до плана, `yarn verify` их не блокирует.
  status: acknowledged

## 04-13: два Toaster в защищённой части

- Где: `app/web/app/layout.tsx` (`<Toaster />`) и `app/web/components/AppLayout/AppLayout.tsx` (`<Toaster />`).
- Что: на страницах внутри `AppLayout` смонтированы два `Toaster`, поэтому каждый `toast.*` показывается дважды. e2e «admin sees session actions in the user card» видит два одинаковых тоста при одном запросе `DELETE /api/users/:id/login-throttle`.
- Почему не исправлено в 04-13: файлы вне плана, поведение существовало до плана и затрагивает все тосты приложения.
  status: acknowledged
