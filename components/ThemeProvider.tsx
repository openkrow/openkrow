import { createContext, useContext, useEffect, useState } from "react";
import type { Theme } from "../shared/types";

type ThemeContextValue = {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (t: Theme) => void;
};

type ThemeSync = {
  getTheme?: () => Promise<Theme>;
  setTheme?: (theme: Theme) => void | Promise<void>;
  subscribe?: (callback: (theme: Theme) => void) => () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

export function ThemeProvider({
  children,
  sync,
  publishInitial = false,
}: {
  children: React.ReactNode;
  sync?: ThemeSync;
  publishInitial?: boolean;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("krow-theme");
    return isTheme(stored) ? stored : "dark";
  });

  const resolved = theme === "system" ? getSystemTheme() : theme;

  const applyTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    localStorage.setItem("krow-theme", nextTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolved]);

  useEffect(() => {
    if (!sync?.getTheme) return;
    let cancelled = false;
    sync.getTheme().then((nextTheme) => {
      if (!cancelled) applyTheme(nextTheme);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sync]);

  useEffect(() => {
    if (!publishInitial || !sync?.setTheme) return;
    sync.setTheme(theme);
  }, []);

  useEffect(() => {
    if (!sync?.subscribe) return;
    return sync.subscribe(applyTheme);
  }, [sync]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setThemeState("system"); // triggers re-render
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    applyTheme(t);
    sync?.setTheme?.(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
