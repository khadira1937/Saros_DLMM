'use client'

import * as React from 'react'
import { MoonStar, SunMedium } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

export const ThemeToggle: React.FC = () => {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const current = resolvedTheme ?? theme
  const isDark = current === 'dark'

  const toggleTheme = React.useCallback(() => {
    setTheme(isDark ? 'light' : 'dark')
  }, [isDark, setTheme])

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="relative h-9 w-9"
    >
      <SunMedium className="h-5 w-5 rotate-0 scale-100 transition-transform duration-200 ease-out dark:-rotate-90 dark:scale-0" />
      <MoonStar className="absolute h-5 w-5 rotate-90 scale-0 transition-transform duration-200 ease-out dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
