export function BudgetStrip({ remaining, cap }: { remaining: number; cap: number }) {
  const pct = Math.min(100, Math.round((remaining / cap) * 100))
  const isLow = pct < 20
  return (
    <div className="w-full h-1 rounded-full bg-border overflow-hidden">
      <div
        data-testid="budget-fill"
        className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-[var(--praxio-primary)]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
