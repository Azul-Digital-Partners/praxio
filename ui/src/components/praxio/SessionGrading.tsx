import { useState } from 'react'

type Grade = 'accepted' | 'minor_edits' | 'major_rework' | 'scrapped'

const GRADES: { value: Grade; label: string; color: string }[] = [
  { value: 'accepted', label: 'Accepted', color: 'bg-green-500' },
  { value: 'minor_edits', label: 'Minor edits', color: 'bg-teal-500' },
  { value: 'major_rework', label: 'Major rework', color: 'bg-amber-500' },
  { value: 'scrapped', label: 'Scrapped', color: 'bg-red-500' },
]

interface SessionGradingProps {
  conversationId: string
  onGrade: (grade: Grade) => void
}

export function SessionGrading({ conversationId, onGrade }: SessionGradingProps) {
  const [selected, setSelected] = useState<Grade | null>(null)

  function handleSelect(grade: Grade) {
    setSelected(grade)
    onGrade(grade)
    fetch('/api/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, grade }),
    }).catch((err) => {
      console.error('Failed to persist grade:', err)
    })
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Grade this session</p>
      <div className="flex flex-col gap-1">
        {GRADES.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => handleSelect(value)}
            className={`text-left text-xs px-3 py-1.5 rounded-lg border transition-all ${
              selected === value
                ? `${color} text-white border-transparent`
                : 'border-border hover:border-[var(--praxio-primary)] text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
