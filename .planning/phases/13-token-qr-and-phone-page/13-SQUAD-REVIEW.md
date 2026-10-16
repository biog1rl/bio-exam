# Squad review — phase 13

Дата: 2026-10-16. Планы: 13-01…13-09. Итог: REVISED (блокеров нет, devils-advocate не запускался). Критики: code-critic (opus), risk-critic. Правки внесла ведущая сессия через Edit, планировщик не вызывался.

## Findings

| id | severity | verdict | evidence | check | status |
|---|---|---|---|---|---|
| C1 | MAJOR | — | `attempt-sessions/access.ts:45,66,84` берёт глобальный `db`; пул на 2 соединения вне production | `rg -n "executor" app/server/src/services/attempt-sessions/access.ts` пусто | fixed: 13-02 T2, 13-03 T1 — полный `readPhotoSlot(db)` до транзакции, под `FOR UPDATE` только окно, правило вопроса и счёт через `tx` |
| R7 | MINOR | — | то же, что C1 | то же | fixed вместе с C1 |
| C2 | MAJOR | — | `PhotoBlock.tsx:353` монтирует `PhotoViewer` с cookie-адресами | `rg -n "PhotoViewer" 13-05-PLAN.md` | fixed: 13-05 T1 п.5 — без полноразмерного источника миниатюра не кликабельна |
| C3 | MAJOR | — | 13-04 ждёт 404 на `/photo-upload`, 13-06 создаёт страницу | `rg -n "404" 13-04-PLAN.md` | fixed: ожидание «не редирект на /login, статус ниже 500» |
| R1 | MAJOR | — | `res.on('finish')` с UPDATE без `.catch` | `rg -n "unhandledRejection" app/server/src` пусто | fixed: 13-03 — `touchUploadLink` глотает ошибку, пишет не чаще раза в 30 с, тест |
| R2 | MAJOR | — | ошибки reverse_proxy Caddy пишут заголовки запроса | на сервере владельцем | fixed: шаг владельца в 13-08 — условие приёмки QR-04 с проверкой после искусственного 502 и аварийным отзывом ссылок |
| R3 | MAJOR | — | `replaceState` стирает фрагмент, «Открыть в браузере» берёт адрес без него | `rg -n "replaceState" 13-06-PLAN.md` | fixed решением владельца 2026-10-16: фрагмент не стирается, `replaceState` убран из 13-01 и 13-06 |
| C4, R5 | MINOR | — | `upload-queue.ts:311-321` | — | fixed: 13-05 behavior `sync` учитывает старт запроса списка |
| C5 | MINOR | — | `not-found.tsx` «На главную» в голом layout | — | fixed: 13-04 — `/photo-upload` только точное совпадение |
| C6 | MINOR | — | `proxy.ts:44-61` refresh до `isPublic` | — | fixed: 13-04 — на анонимной странице `passThrough` без refresh, тест |
| C7 | MINOR | — | `review-recipients.ts:16-23` | — | fixed: запись в SUMMARY 13-02 |
| C8, R4 | MINOR | — | лимит неизвестного токена после поиска в БД | — | fixed: широкий IP-предохранитель 3000/мин до `resolveUploadLink`, `clientKey` функцией |
| R6 | MINOR | — | окно без таймера открыто без срока | `upload-window.ts:37` | fixed решением владельца 2026-10-16: потолок 24 часа от выдачи, ссылка до сдачи мертва после сдачи (13-03) |
| R8 | MINOR | — | нет тестов параллельной выдачи, лимитера неизвестного токена, `last_used_at` на GET, отказа `touch` | — | fixed: добавлены в 13-03 T2 |

## Refuted

Нет.

## Revision

Точечные Edit в 13-01, 13-02, 13-03, 13-04, 13-05, 13-06, 13-08, 13-CONTEXT. Новых планов нет.
