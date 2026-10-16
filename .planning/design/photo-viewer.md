# Просмотрщик фото ответа

Дизайн-система, карточка `PhotoViewer`. Одно окно для трёх мест: блок фото раннера (`PhotoBlock`, `SubmittedPhotos`), страница результата ученика, экран проверки учителя (фаза 15).

## Вход

- Миниатюра становится кнопкой: `button` вокруг `img` 64px, `aria-label="Открыть фото {n}"`, `cursor-zoom-in`, кольцо фокуса 3px `ring`. Остальная строка `PhotoBlock` не меняется.
- Данные: список фото ответа `{ id, uploadedAt }` (у учителя ещё пометки, если сервер их отдаёт) и индекс открытого. Крупное фото — `answerPhotoUrl(id, 'full')`, заглушка — `'thumb'`.

## Окно

- `Dialog` из `components/ui`, оверлей общий, `p-0 gap-0`, колонка из шапки, сцены и низа.
- От 768px: `bg-popover`, `rounded-lg`, `w-[min(1120px,calc(100vw-3rem))] max-w-none h-[calc(100dvh-3rem)]`.
- До 768px: `inset-0 h-dvh w-screen rounded-none border-0`, безопасные зоны: шапке `pt-[env(safe-area-inset-top)]`, низу `pb-[env(safe-area-inset-bottom)]`.

## Разметка

**Шапка** — 64px, до 768px 56px; `border-b`, поля слева 20px (16px).
- Слева `DialogTitle`: «Фото {n} из {N}» (`text-base font-semibold`). Под ним `text-xs text-muted-foreground`: «Загружено {d MMM}, {HH:mm}».
- У учителя, если сервер отдал пометки, — `Badge variant="outline"` «после окончания времени» и «с телефона по ссылке».
- Справа от 768px ghost-кнопки 36px `rounded-full` в таком порядке:
  1. «Уменьшить» (`ZoomOut`);
  2. масштаб: текстовая кнопка «100%» с `tabular-nums`, `min-w-16`, сбрасывает масштаб;
  3. «Увеличить» (`ZoomIn`);
  4. «Повернуть на 90°» (`RotateCw`);
  5. разделитель;
  6. «Закрыть» (`X`).
- До 768px в шапке только «Закрыть» 44px.

**Сцена** — `flex-1 min-h-0 bg-muted overflow-hidden`.
- Фото по центру целиком: `max-h-full max-w-full object-contain`, `shadow-md`. Масштаб 100% означает «вписано».
- От 768px «Предыдущее фото» и «Следующее фото» — `variant="outline"`, 40px, `rounded-full`, `bg-card`, по краям сцены (`left-4`/`right-4`, по центру высоты).
- На первом и последнем фото соответствующая кнопка `disabled`. По кругу не листается.

**Низ.**
- От 768px — 40px, `border-t`, подсказка `text-xs text-muted-foreground`.
- До 768px — полоса 64px, `border-t`, `justify-between`, кнопки 44px: ‹, уменьшить, масштаб, увеличить, повернуть, ›.

**Одно фото.** Заголовок «Фото 1» без «из N», кнопок листания нет, клавиши ←/→ ничего не делают.

## Тексты

| Где | Текст |
|---|---|
| Заголовок | `Фото {n} из {N}`; одно фото — `Фото 1` |
| Время | `Загружено {d MMM}, {HH:mm}` (локальное время, как `formatDateTime`) |
| Пометки учителя | `после окончания времени`, `с телефона по ссылке` |
| Кнопки (`aria-label` и `Tooltip`) | `Уменьшить`, `Увеличить`, `Сбросить масштаб, сейчас {P}%`, `Повернуть на 90°`, `Предыдущее фото`, `Следующее фото`, `Закрыть` |
| Подсказка от 768px | `Колесо — масштаб, перетаскивание — сдвиг увеличенного фото, ← → — другое фото, Esc — закрыть` |
| `alt` крупного фото | `Фото {n}` |
| Загрузка | `Загрузка фото…` (`role="status"`) |
| Ошибка | `Не удалось загрузить фото`, кнопка `Повторить` |
| Объявление смены | `Фото {n} из {N}` (скрытый `aria-live="polite"`) |

## Масштаб: `react-zoom-pan-pinch` 4.2.0

```tsx
<TransformWrapper
  key={photo.id}                      // смена фото — новый экземпляр, масштаб сбрасывается
  minScale={1} maxScale={5} initialScale={1}
  centerOnInit centerZoomedOut limitToBounds
  wheel={{ step: 0.2 }}
  pinch={{ step: 5 }}
  doubleClick={{ mode: 'toggle', step: 1, animationTime: 200 }}
  panning={{ disabled: scale <= 1, velocityDisabled: true }}
  keyboard={{ disabled: true }}       // клавиши обрабатываем сами: стрелки листают
  onTransform={(_, state) => setScale(state.scale)}
>
  <TransformComponent wrapperClass="!size-full" contentClass="!size-full flex items-center justify-center">
    <img style={{ transform: `rotate(${rotation}deg)` }} … />
  </TransformComponent>
</TransformWrapper>
```

- Кнопки через `useControls()`: `zoomIn(0.5, 200)`, `zoomOut(0.5, 200)`, `resetTransform(200)`. Кнопка масштаба показывает `Math.round(scale * 100)` с «%».
- Поворот — своё состояние 0, 90, 180, 270 на `img`; «Сбросить масштаб» поворот не трогает, смена фото сбрасывает и его.
- Сдвиг перетаскиванием — только при масштабе больше 1. При масштабе 1 горизонтальный свайп листает: смещение больше 60px быстрее 500 мс, по `pointerdown`/`pointerup` на сцене.

## Загрузка и ошибки

- Пока грузится `full`: `thumb`, растянутый на место фото, `opacity-50`, поверх `Loader2` 20px и «Загрузка фото…».
- Соседние фото (`n ± 1`) догружаются заранее через `new Image()`.
- Ошибка: круг 48px `bg-card` с `ImageOff` 20px `text-muted-foreground`, текст и «Повторить» (`variant="outline" rounded-full`, 44px до 768px). Повтор добавляет `?r={n}` к адресу.

## Клавиатура и фокус

- ← и → — листание; `+` и `=` — увеличить; `-` — уменьшить; `0` — сброс; `R` (и `К` в русской раскладке) — повернуть; Esc — закрыть. Обработчик на содержимом окна, кроме случаев, когда фокус в поле ввода.
- Закрыть: крестик, Esc, щелчок по оверлею (от 768px). Щелчок по сцене окно не закрывает.
- При открытии фокус на содержимом окна (`tabIndex={-1}`, `onOpenAutoFocus`), чтобы стрелки работали сразу. Tab — по кнопкам шапки, листания и низа.
- После закрытия фокус возвращается на миниатюру, с которой открыли (`use-return-focus`). Если миниатюры уже нет — на заголовок блока фото.

## Движение

- Окно — `duration-moderate` (200ms), как `Dialog`.
- Фото меняется сразу, без сдвига и затухания.
- Масштаб кнопками и двойным щелчком — 200ms, колесо и щипок — без задержки.
- При `prefers-reduced-motion` — `animationTime: 0`.

## Токены и контраст

- Цвета: `popover`, `muted` (сцена), `card` (кнопки листания и круг ошибки), `foreground`, `muted-foreground`, `border`, `ring`.
- Тени: `shadow-md` у фото, `shadow-lg` у окна.
- Текст шапки и подсказки — `foreground` и `muted-foreground` на `popover`: 15,5 и 6,1:1.
- Иконки кнопок — `foreground`, на `muted` 13,9:1.
