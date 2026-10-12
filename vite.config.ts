import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  // Identificador desta versão (commit da Vercel, ou data/hora do build). Serve para avisar quando há versão nova.
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(36);

  return {
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [
      react(),
      {
        // Publica /version.json com o id desta versão; a app compara-o com o id que tem carregado
        name: "emit-version-json",
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: buildId }) });
        },
      },
    ],
    // 🚫 NÃO exponhas secrets no bundle do browser
    // Se precisares de variáveis no client, usa VITE_*
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
