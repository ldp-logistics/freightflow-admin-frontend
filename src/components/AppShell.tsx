import { Link, useLocation } from 'wouter'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui'

type NavItem = { href: string; label: string }
type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { href: '/', label: 'Overview' },
      { href: '/organizations', label: 'Organizations' },
      { href: '/workspace', label: 'Workspace' },
      { href: '/users', label: 'Users' },
      { href: '/user-activity', label: 'User activity' },
      { href: '/shipments', label: 'Shipments' },
      { href: '/containers', label: 'Containers' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/approvals', label: 'Approvals' },
      { href: '/missing-mbl', label: 'Missing MBL' },
      { href: '/routing', label: 'Routing' },
      { href: '/hub', label: 'Hub' },
      { href: '/emails', label: 'Emails' },
    ],
  },
  {
    label: 'System',
    items: [{ href: '/settings', label: 'Settings' }],
  },
]

function isActive(loc: string, href: string) {
  if (href === '/') return loc === '/'
  return loc === href || loc.startsWith(href + '/')
}

function NavLinks({
  loc,
  onNavigate,
}: {
  loc: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-4 px-3 pb-4">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="admin-nav-group">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(loc, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="admin-nav-link"
                  data-active={active}
                >
                  <span className="admin-nav-dot" aria-hidden />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useLocation()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [loc])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="admin-shell">
      {/* Desktop sidebar */}
      <aside className="admin-sidebar sticky top-0 hidden h-screen lg:flex">
        <div className="flex h-full w-full flex-col">
          <div className="border-b border-[var(--line)] px-4 py-4">
            <Link href="/" className="block">
              <img
                src="/black-logo.png"
                alt="LDP Logistics"
                className="h-8 w-auto max-w-full object-contain"
              />
              <div className="mt-3">
                <p className="ldp-eyebrow mb-0 text-[10px]">FreightFlow</p>
                <p className="text-sm font-bold tracking-tight">Super Admin</p>
              </div>
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto py-3">
            <NavLinks loc={loc} />
          </div>
          <div className="border-t border-[var(--line)] p-3">
            <p className="truncate px-2 text-xs text-[var(--muted)]" title={user?.email}>
              {user?.email}
            </p>
            <Button
              variant="secondary"
              type="button"
              className="mt-2 w-full"
              onClick={() => {
                logout()
                setLoc('/login')
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ink)]/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="admin-sidebar absolute inset-y-0 left-0 z-10 flex h-full shadow-[var(--shadow-md)] animate-[slideIn_0.2s_ease]">
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                <img src="/black-short-logo.png" alt="LDP" className="h-8 w-auto object-contain" />
                <Button variant="ghost" type="button" onClick={() => setMenuOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto py-3">
                <NavLinks loc={loc} onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="border-t border-[var(--line)] p-3">
                <p className="truncate px-2 text-xs text-[var(--muted)]">{user?.email}</p>
                <Button
                  variant="secondary"
                  type="button"
                  className="mt-2 w-full"
                  onClick={() => {
                    logout()
                    setLoc('/login')
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="admin-main">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              type="button"
              className="!px-2.5"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <span className="flex flex-col gap-1" aria-hidden>
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <img src="/black-short-logo.png" alt="LDP Logistics" className="h-7 w-auto object-contain" />
              <span className="text-sm font-bold">Super Admin</span>
            </Link>
          </div>
          <Button
            variant="ghost"
            type="button"
            className="!text-xs"
            onClick={() => {
              logout()
              setLoc('/login')
            }}
          >
            Sign out
          </Button>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
