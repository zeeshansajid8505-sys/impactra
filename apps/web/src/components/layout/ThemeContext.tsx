'use client';

import React, { createContext, useContext, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'impactra_theme';
const DEFAULT_THEME: Theme = 'light';
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return DEFAULT_THEME;
  }
}

function updateDocumentClass(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }
}

export const themeStore = {
  getSnapshot(): Theme {
    return getStoredTheme();
  },
  getServerSnapshot(): Theme {
    return DEFAULT_THEME;
  },
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    // Synchronize document element class on initial client attachment
    updateDocumentClass(getStoredTheme());

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        updateDocumentClass(getStoredTheme());
        callback();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      listeners.delete(callback);
      window.removeEventListener('storage', handleStorage);
    };
  },
  setTheme(newTheme: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage quota or security errors
    }
    updateDocumentClass(newTheme);
    emitChange();
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot
  );

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    themeStore.setTheme(next);
  };

  const setTheme = (newTheme: Theme) => {
    themeStore.setTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
