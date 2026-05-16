import { MessageSquare, Users, BookOpen, BarChart2 } from 'lucide-react'
import { gradients } from '@/theme'

const navItems = [
  { icon: MessageSquare, label: 'Conversations', href: '#conversations' },
  { icon: Users, label: 'Org Chart', href: '#org' },
  { icon: BookOpen, label: 'Registry', href: '#registry' },
  { icon: BarChart2, label: 'Analytics', href: '#analytics' },
]

export function NavRail() {
  return (
    <nav
      className="flex h-full w-14 flex-col items-center py-4 gap-6"
      style={{ background: gradients.nav }}
    >
      <div className="text-white font-bold text-sm tracking-tight select-none">P</div>
      <div className="flex flex-col gap-4 flex-1">
        {navItems.map(({ icon: Icon, label, href }) => (
          <a
            key={label}
            href={href}
            title={label}
            className="text-white/70 hover:text-white transition-colors"
          >
            <Icon size={20} />
          </a>
        ))}
      </div>
    </nav>
  )
}
