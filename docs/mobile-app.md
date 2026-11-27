# Mobile app

The iOS and Android apps wrap the web app with [Capacitor](https://capacitorjs.com) (`android/`,
`ios/`, `capacitor.config.ts`). The app starts with bazarpro.de; "Server wechseln" on the sign-in
and account pages switches to a self-hosted instance. It talks to the server's `/api` with a
bearer token instead of the session cookie (`src/native/`).

```bash
npm run build:app      # vite --mode app → dist-app/, then cap sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode (macOS only)
```

Self-hosted instances need nothing extra: the backend allows the app's origins by default
(`APP_ORIGINS`). For Google/GitHub sign-in the app opens the system browser and comes back via
`bazarpro://auth`. The app refuses servers whose `instance.getConfig` reports an `appApi` below
its minimum (`APP_API` in `backend/src/modules/instance.rs`); raise both on breaking changes of
the app's API.

Every CI run attaches a debug APK (`bazarpro-debug-apk`) for testing on Android devices.

Icon and splash screen show the BazarPro mark (`src/components/layout/BrandMark.tsx`).
`node scripts/app-assets/render.mjs` writes the sources `assets/*.svg` and renders every PNG
in `android/` and `ios/` in the sizes of the Capacitor template, plus `public/logo.png`.

## Store release checklist

- Android: create an upload keystore, add a `release` signing config to
  `android/app/build.gradle`, raise `versionCode`/`versionName`, build with
  `./gradlew bundleRelease` and upload the `.aab` to the Play Console
- iOS: set team and bundle id `de.bazarpro.app` in Xcode, raise the version, Product → Archive,
  upload to App Store Connect
- Store listings need a privacy policy URL and the data-safety/privacy details (account data,
  photos, camera for the QR scanner); accounts can be deleted in the app (Account → danger zone),
  as Apple requires
