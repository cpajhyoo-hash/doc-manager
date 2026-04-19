'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/documents', label: 'Documents' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/upload', label: 'Upload' },
  { href: '/recycle-bin', label: 'Recycle Bin' },
  { href: '/users', label: 'Users' },
]

const roleColors: Record<string, string> = {
  Master: 'bg-violet-100 text-violet-700',
  Approver: 'bg-sky-100 text-sky-700',
  Contributor: 'bg-slate-100 text-slate-600',
}

export default function SidebarNav() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { profile, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">Navigation</h2>
      </div>

      <div className="flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      {profile && (
        <div className="mt-6 border-t border-slate-200 pt-5 space-y-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 truncate">{profile.email}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{profile.name}</p>
            <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleColors[profile.role] ?? roleColors.Contributor}`}>
              {profile.role}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
