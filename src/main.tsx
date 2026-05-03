import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { hydrateAuthFromNativeStorage, startAuthPersistenceMirror } from "./lib/authBootstrap";
import { ensurePushLifecycleStarted } from "./services/push";
import "./index.css";

// Глобални handler-и — улавят native/JS грешки, за да не crash-ва WebView-ът тихо.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[window.onerror]', e.message, e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandledrejection]', e.reason);
  });
}

async function bootstrap() {
  // ВАЖНО: hydrate auth ПРЕДИ React да mount-не — Supabase клиентът чете
  // localStorage синхронно при импорт.
  try { await hydrateAuthFromNativeStorage(); } catch (e) { console.warn(e); }
  startAuthPersistenceMirror();
  const { default: App } = await import("./App.tsx");

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );

  ensurePushLifecycleStarted();
}

void bootstrap();

