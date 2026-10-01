import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ✅ PWA Service Worker (necessário para instalar como app e usar o ícone do manifest)
// Corre só no browser, mas continua a funcionar como PWA normalmente.
if (typeof window !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.debug("SW registration failed:", err));
  });
}
