# Отложенное: quick-001

- Профиль ученика на мобильном (412px): колонка шире экрана на 16px из-за сетки «Назначенные тесты / Назначить тест» (`UserProfileAssignmentsPage.tsx`, `grid gap-6 lg:grid-cols-2`). Если скрыть график, пресеты, фильтры и список, ширина не меняется.
- `/dashboard` на мобильном: колонка 567px при ширине экрана 412px.
- `DashboardClient.tsx`: oxlint `no-unused-vars` для `adminStudentChartConfig`, `studentProgress`, `groupedTests`, `adminStudentScores`. Файл общий с 04-12.
