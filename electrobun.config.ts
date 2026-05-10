import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Krow",
    identifier: "ai.krow.desktop",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.tsx",
      },
      settingsview: {
        entrypoint: "src/settingsview/index.tsx",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/styles.css": "views/mainview/styles.css",
      "src/settingsview/index.html": "views/settingsview/index.html",
    },
  },
} satisfies ElectrobunConfig;
