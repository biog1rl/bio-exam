# Отложенные находки фазы 6

## 06-08

- Подсказка автодополнения редактора попадает в `promptText` черновика. При вводе `trace text` в формулировку на сервер уходит `trace textbooks (TAB)` (desktop) или `trace textbooks (SWIPE ⮕)` (mobile): узел подсказки `app/web/components/editor/plugins/autocomplete-plugin.tsx` сериализуется в MDX. Существующие e2e проверяют `toContainText`, поэтому не замечают. К 06-08 отношения не имеет (поведение редактора), не исправлялось.
  status: acknowledged
