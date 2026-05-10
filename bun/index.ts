import { BrowserWindow, ApplicationMenu } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { WorkspaceManager } from "./workspace";
import { createRpcHandler } from "./rpc";
import { createSettingsRpcHandler } from "./settings-rpc";

// Ensure opencode CLI is on PATH
const home = homedir();
process.env.PATH = `${join(home, ".opencode/bin")}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`;
process.env.HOME = home;

// Capture views folder path before process.chdir() happens in workspace.start()
const viewsRoot = resolve("../Resources/app/views");

// Core services
const workspace = new WorkspaceManager();
const desktopPath = join(home, "Desktop");
const rpc = createRpcHandler(workspace, desktopPath, openSettingsWindow);

// Settings window management
let settingsWindow: BrowserWindow | null = null;

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.activate();
    return;
  }

  const settingsRpc = createSettingsRpcHandler(workspace, () => {
    rpc.send.settingsChanged({});
  });
  settingsWindow = new BrowserWindow({
    title: "Settings",
    url: "views://settingsview/index.html",
    rpc: settingsRpc,
    titleBarStyle: "hiddenInset",
    viewsRoot,
    frame: {
      width: 560,
      height: 600,
      x: 200,
      y: 100,
    },
  });

  const settingsId = settingsWindow.id;
  Electrobun.events.on("close", (event: any) => {
    if (event?.data?.id === settingsId) {
      settingsWindow = null;
    }
  });
}

// Application menu
ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { label: "About Krow", role: "about" },
      { type: "separator" },
      { label: "Settings...", action: "open-settings", accelerator: "cmd+," },
      { type: "separator" },
      { label: "Hide Krow", role: "hide" },
      { label: "Hide Others", role: "hideOthers" },
      { label: "Show All", role: "showAll" },
      { type: "separator" },
      { label: "Quit Krow", role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { label: "Toggle Full Screen", role: "toggleFullScreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { role: "close" },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event: any) => {
  if (event?.action === "open-settings") {
    openSettingsWindow();
  }
});

// Main window
const win = new BrowserWindow({
  title: "Krow",
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 500,
    height: 800,
    x: 0,
    y: 0,
  },
});

// Cleanup on exit
const cleanup = () => workspace.stop();

Electrobun.events.on("before-quit", cleanup);
process.on("exit", cleanup);
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("beforeExit", cleanup);
