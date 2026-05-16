type Status = 'live' | 'busy' | 'idle'

const statusConfig: Record<Status, { color: string; label: string }> = {
  live: { color: 'bg-green-400', label: 'Live' },
  busy: { color: 'bg-yellow-400', label: 'Busy' },
  idle: { color: 'bg-gray-400', label: 'Idle' },
}

export function PresenceIndicator({ status }: { status: Status }) {
  const { color, label } = statusConfig[status]
  return (
    <span
      title={label}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`}
    />
  )
}
