# Native app assets

Тази папка съдържа изходните файлове за иконки и splash screens на Android/iOS приложенията.

## Файлове
- `icon.png` — app иконка (1024x1024 препоръчително). Използва се за всички размери на Android/iOS.
- `splash.png` — splash screen (2732x2732 препоръчително, лого центрирано в средните ~40%). Capacitor автоматично crop-ва за всички размери екрани.

## Генериране на native ресурси

След `npx cap add ios` / `npx cap add android` (виж главния README):

```bash
npx capacitor-assets generate --iconBackgroundColor '#FFFFFF' --splashBackgroundColor '#FFFFFF'
```

Това ще създаде всички нужни размери в `android/app/src/main/res/` и `ios/App/App/Assets.xcassets/`.

## Подмяна на иконката

Просто замести `icon.png` (квадратна, минимум 1024x1024) и пусни командата по-горе. Същото за `splash.png`.
