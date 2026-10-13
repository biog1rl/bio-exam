# Deferred items — phase 07

- 07-13: `app/server/src/routes/auth/login-throttle.test.ts` нестабилен под нагрузкой в `yarn verify`: «шесть неудач без паузы…» получает `Retry-After 28` при ожидании 29…31, «после истечения окна…» — пустой `window_sec`. Отдельный прогон файла — 24 из 24, повторный `yarn verify` — OK. Вне области фазы 7 (auth).
  status: acknowledged
