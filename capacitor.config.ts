import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor конфигурация за Семейна Локация.
 *
 * Production билдове опаковат bundled `dist/`. За да обновиш мобилните приложения:
 *   1) `git pull`
 *   2) `npm run mobile:build`   (= vite build && cap sync)
 *   3) `npx cap open ios` или `npx cap open android` и направи нов архив/билд
 *
 * За hot-reload по време на разработка — раз-коментирай блока `server` по-долу.
 * НЕ оставяй активен за store билдове.
 */
const config: CapacitorConfig = {
  appId: 'app.lovable.eaf9a1a1e6d44660bcc5cee4a68bcf76',
  appName: 'family-location',
  webDir: 'dist',
  // server: {
  //   url: 'https://eaf9a1a1-e6d4-4660-bcc5-cee4a68bcf76.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
    // Production: изключва Chrome DevTools достъп до WebView съдържанието на устройството.
    // Изисква се за store билдове (security best practice; Apple/Google изискват
    // приложения да не са remotely debuggable в production).
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#FFFFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
