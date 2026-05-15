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
      entrypoint: "bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "mainview/index.tsx",
      },
      settingsview: {
        entrypoint: "settingsview/index.tsx",
      },
    },
    copy: {
      "mainview/index.html": "views/mainview/index.html",
      "mainview/styles.css": "views/mainview/styles.css",
      "mainview/logo.png": "views/mainview/logo.png",
      "settingsview/index.html": "views/settingsview/index.html",
    },
  },
} satisfies ElectrobunConfig;
