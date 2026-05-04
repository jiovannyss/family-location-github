import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DEFAULT_THEME: ThemeMode = 'system';
const VALID = new Set<ThemeMode>(['system', 'light', 'dark']);

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && VALID.has(v as ThemeMode)) return v as ThemeMode;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

function resolveEffective(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return mode;
}

function applyToDom(effective: 'light' | 'dark') {
  const root = document.documentElement;
  if (effective === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  // Sync color-scheme и meta theme-color
  root.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = effective === 'dark' ? '#14201f' : '#ffffff';
  if (meta) meta.setAttribute('content', color);
  else {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = color;
    document.head.appendChild(m);
  }

  // Native StatusBar (Capacitor)
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: effective === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
    if (Capacitor.getPlatform() === 'android') {
      StatusBar.setBackgroundColor({ color }).catch(() => {});
    }
  }
}

interface ThemeCtx {
  theme: ThemeMode;
  effective: 'light' | 'dark';
  setTheme: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective(getStoredTheme()));
  const lastWrittenRef = useRef<string | null>(null);

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    const eff = resolveEffective(theme);
    setEffective(eff);
    applyToDom(eff);
  }, [theme]);

  // Listen to system color-scheme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const eff = mq.matches ? 'dark' : 'light';
      setEffective(eff);
      applyToDom(eff);
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [theme]);

  const setTheme = useCallback((m: ThemeMode) => {
    if (!VALID.has(m)) return;
    setThemeState(m);
    try { window.localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  }, []);

  // Pull from DB once user is available
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('theme')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const remote = data.theme as ThemeMode | null;
      if (remote && VALID.has(remote)) {
        lastWrittenRef.current = remote;
        if (remote !== getStoredTheme()) setTheme(remote);
      }
    })();
    return () => { cancelled = true; };
  }, [user, setTheme]);

  // Push local changes to DB
  useEffect(() => {
    if (!user) return;
    if (lastWrittenRef.current === theme) return;
    lastWrittenRef.current = theme;
    supabase
      .from('user_settings')
      .upsert({ user_id: user.id, theme }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) {
          lastWrittenRef.current = null;
          console.warn('Failed to persist theme:', error);
        }
      });
  }, [user, theme]);

  return (
    <ThemeContext.Provider value={{ theme, effective, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
