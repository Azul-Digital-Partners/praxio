import { useState } from 'react'
import { Send } from 'lucide-react'

interface MessageInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <div className="flex items-end gap-2 p-3 border-t border-border">
      <textarea
        className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--praxio-primary)] min-h-[40px] max-h-[120px]"
        placeholder="Send a message..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
      />
      <button
        onClick={submit}
        disabled={!value.trim() || disabled}
        className="flex-shrink-0 p-2 rounded-xl bg-[var(--praxio-primary)] text-white disabled:opacity-40 hover:bg-[var(--praxio-primary-dark)] transition-colors"
      >
        <Send size={16} />
      </button>
    </div>
  )
}
