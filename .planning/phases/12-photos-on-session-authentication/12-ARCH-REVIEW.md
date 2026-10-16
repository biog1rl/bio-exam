# Архитектурный осмотр — фаза 12

Дата: 2026-10-13. Источник: gsd-arch-scan (--findings-only).
Область: `services/storage/*`, `services/assets/*`, `routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/admin/assets.ts`, `services/attempt-sessions/upload-window.ts`, `services/access-policy/*`, обработка ошибок multer в `app.ts`, web-код загрузки (`MediaLibrary.tsx`, `lib/http/errors.ts`).

## Находки

### A1. Правило приёма изображения разнесено по шести местам (Strong, рекомендация: в этой фазе)
- Файлы: `routes/docs/assets.ts:20-32`, `routes/users/avatar.ts:10-23`, `routes/tests/admin/assets.ts:15-28`, `services/assets/images.ts:24-71`, `services/assets/avatars.ts:19-24,143-155`, `services/assets/inline-images.ts:16-43`.
- Трение: четыре расходящихся списка типов (в двух встроен GIF), `MEDIA_PREFIX`/`MAX_DIMENSION`/`WEBP_QUALITY` повторены, ни одно место не делает `autoOrient` и не чистит метаданные явно; аватар пишет исходный буфер как есть. Фото ответа станет четвёртым вариантом.
- Тест удаления: сложность возвращается к каждому вызывающему. Зависимость: in-process (sharp, file-type) и local-substitutable (memory-адаптер).
- Тесты сейчас: HTTP-уровень (`routes/uploads.test.ts`, `routes/docs/assets*.test.ts`, `routes/users/avatar.characterization.test.ts`), на интерфейсе приёма нет.
- Связь с фазой: расширяет.

### A2. Отказ multer превращается в 500 (Strong, рекомендация: в этой фазе)
- Файлы: фильтры в `routes/docs/assets.ts:29`, `routes/users/avatar.ts:20`, `routes/tests/admin/assets.ts:25` бросают голый `Error`; общий обработчик `app.ts:100-145` (ветка 122-137) отдаёт 500; тесты закрепляют дефект: `routes/uploads.test.ts:163,170,298,396,411`.
- Трение: подмена MIME даёт 500, неверная сигнатура даёт 400; «File too large» и «Unexpected end of form» тоже 500. Это DEBT-01.
- Зависимость: in-process. Связь с фазой: расширяет.

### A3. Кто читает какое пространство хранилища, нигде не записано (Strong, рекомендация: в этой фазе)
- Файлы: `services/storage/keys.ts:3,75-82`, `services/storage/index.ts:158-160`, `services/storage/links.ts:11,57-59,97-113`, `routes/docs/assets.ts:72-83`.
- Трение: правило доступа склеено из списка строк, предиката `isServableImageKey` и шаблона URL прокси. Добавление `answers` в `STORAGE_NAMESPACES` заставит `storageUrl` выдавать ссылку на прокси, который её откажет; «мимо прокси» держится на неявном незнании предиката. В ADR-0004 об этом ничего нет (DEBT-07).
- Зависимость: in-process. Связь с фазой: расширяет.

### A4. Клиент подстраивается под режим ошибок сервера (Worth exploring, рекомендация: отложено)
- Файлы: `MediaLibrary.tsx:165,212,321`, `app/web/lib/http/errors.ts:28`.
- Трение: из-за A2 текст сервера до пользователя не доходит, клиент дублирует лимит 5 МБ и список MIME. Фаза только читает; новый компонент фото берёт текст из 4xx.

### A5. Вероятно мёртвый маршрут `POST /api/tests/:id/assets` (Worth exploring, рекомендация: отложено)
- Файлы: `routes/tests/admin/assets.ts:1-65`, подключён в `routes/tests/index.ts:31`. Вызывающих нет в `app/web` и `e2e`, пишет в общую `images/`, его multer пропускает GIF.
- Тест удаления проходит. Перед удалением сверить `route-inventory.snapshot.test.ts`.

## Не находки
- `upload-window.ts` и `canReviewAttempt` — глубокие модули с тестами, фаза их читает. У `photoUploadWindow`/`uploadWindowRefusal` пока нет боевых вызывающих: шов ждёт эту фазу.
- Вне находок: `.rotate()`/`autoOrient` нигде не вызывается в `services/assets/*`, фото с iPhone в медиатеке, вероятно, ложатся повёрнутыми; закрывается вместе с A1.
- `rateLimiter` на маршрутах загрузки не стоит; память он не ограничивает, это задача лимитов multer, пикселей и параллельности sharp.

## Решения
| id | название | решение | причина | модуль-владелец |
|----|----------|---------|---------|-----------------|
| A1 | Единое правило приёма изображения | в этой фазе | фаза расширяет приём; иначе четвёртая копия | `services/assets` (модуль приёма изображения) |
| A2 | Отказы multer → 413/415/400 | в этой фазе | DEBT-01, критерий 2 фазы | `app.ts` и маршруты загрузки |
| A3 | Правило доступа к пространствам хранилища | в этой фазе | `answers/` не должен попасть в общий прокси; DEBT-07 | `services/storage` |
| A4 | Клиент подстраивается под 500 | отложено | фаза только читает; новый компонент берёт текст из 4xx | `app/web/components/editor/plugins/images-plugin` |
| A5 | Мёртвый `POST /api/tests/:id/assets` | в этой фазе (удалить) | вызывающих нет; решение пользователя вместо рекомендации «отложено» | `routes/tests/admin/assets.ts` |

## Для планировщика
- A1: углубить приём изображений отдельным планом до планов маршрутов и фото.
- A2: единое преобразование ошибок multer, переписать тесты, закрепляющие 500.
- A3: собрать правило доступа к пространствам, дописать ADR-0004 (DEBT-07).
- A5: удалить маршрут после сверки с `route-inventory.snapshot.test.ts` и ADR.
