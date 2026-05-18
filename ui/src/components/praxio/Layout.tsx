import type { ReactNode } from 'react'

interface PraxioLayoutProps {
  navRail: ReactNode
  sidebar: ReactNode
  main: ReactNode
  rightPanel: ReactNode
}

export function PraxioLayout({ navRail, sidebar, main, rightPanel }: PraxioLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="w-14 flex-shrink-0">{navRail}</div>
      <div className="w-[220px] flex-shrink-0 border-r border-border">{sidebar}</div>
      <div className="flex-1 overflow-hidden">{main}</div>
      <div className="w-[220px] flex-shrink-0 border-l border-border">{rightPanel}</div>
    </div>
  )
}
