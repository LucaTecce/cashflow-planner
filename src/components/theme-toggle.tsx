'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Switch } from '@/components/ui/switch';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = (resolvedTheme ?? theme) === 'dark';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Light</span>
      <Switch
        checked={isDark}
        onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')}
        aria-label="Theme toggle"
      />
      <span className="text-xs text-muted-foreground">Dark</span>
    </div>
  );
}
