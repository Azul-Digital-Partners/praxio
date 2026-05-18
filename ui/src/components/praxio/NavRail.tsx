import { MessageSquare, Users, BookOpen, BarChart2, ShieldCheck } from 'lucide-react'
import { gradients } from '@/theme'
import { ThemeToggle } from './ThemeToggle'
import { useNavigate, useLocation } from '@/lib/router'
import { useQuery } from '@tanstack/react-query'
import { approvalsApi } from '@/api/approvals'
import { useCompany } from '@/context/CompanyContext'
import { queryKeys } from '@/lib/queryKeys'

const routeItems = [
  { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
  { icon: ShieldCheck,   label: 'Approvals',     path: '/approvals/pending' },
]

const anchorItems = [
  { icon: Users,    label: 'Org Chart', href: '#org' },
  { icon: BookOpen, label: 'Registry',  href: '#registry' },
  { icon: BarChart2, label: 'Analytics', href: '#analytics' },
]

interface NavRailProps {
  isDark: boolean
  onToggle: () => void
}

export function NavRail({ isDark, onToggle }: NavRailProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedCompanyId } = useCompany()

  const { data: approvals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  })
  const pendingCount = approvals?.filter((a: any) => a.status === 'pending').length ?? 0

  return (
    <nav
      className="flex h-full w-14 flex-col items-center py-4 gap-6"
      style={{ background: gradients.nav }}
    >
      <div className="text-white font-bold text-sm tracking-tight select-none">P</div>
      <div className="flex flex-col gap-4 flex-1">
        {routeItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname.startsWith(path.split('/').slice(0, 2).join('/'))
          const showBadge = label === 'Approvals' && pendingCount > 0
          return (
            <button
              key={label}
              title={label}
              onClick={() => navigate(path)}
              className={`relative transition-colors ${isActive ? 'text-white' : 'text-white/70 hover:text-white'}`}
            >
              <Icon size={20} />
              {showBadge && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          )
        })}
        {anchorItems.map(({ icon: Icon, label, href }) => (
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
      <ThemeToggle isDark={isDark} onToggle={onToggle} />
    </nav>
  )
}
