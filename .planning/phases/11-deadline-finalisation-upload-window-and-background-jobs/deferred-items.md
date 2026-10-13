# Отложенное: фаза 11

## 11-18

- Кнопки номеров вопросов в правой панели страницы попытки (`app/web/components/tests/TestRunner.tsx`, класс `bg-green-500 text-white` у отвеченного вопроса) не проходят AA по `lowContrastTexts`: 1.81 на chromium-desktop и 1.05 на chromium-mobile при ширине 375 px (текст «1»). Поверхность существовала до фазы 11 и не входит в UI-SPEC фазы; спек `deadline-finalised.spec.ts` исключает записи вида «ratio «N»» из проверки `lowContrastTexts` и измеряет панель исхода, строку окна и пометку отдельно. Значение 1.05 на mobile не диагностировалось.
