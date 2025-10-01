import type { ReactNode } from 'react'

import { ThemeProvider } from '@/components/ui/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'

import ClientShell from './ClientShell'

export const metadata = {
  title: 'DLMM LP Copilot',
  description: 'Manage Saros DLMM liquidity positions',
}

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="h-full min-h-screen bg-background font-sans text-foreground antialiased m-0 p-0">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider>
            <ClientShell>{children}</ClientShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
