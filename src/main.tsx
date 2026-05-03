import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
