'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import SidebarNav from '../components/SidebarNav'
import type { Profile, UserRole } from '../lib/types'
import { ROLE_OPTIONS } from '../lib/types'

const roleColors: Record<UserRole, string> = {
  Master: 'bg-violet-100 text-violet-700',
  Approver: 'bg-sky-100 text-sky-700',
  Contributor: 'bg-slate-100 text-slate-600',
}

export default function UsersPage() {
  const { profile: currentProfile, user, loading: authLoading } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const isMaster = currentProfile?.role === 'Master'

  useEffect(() => {
    if (authLoading || !user) return

    const loadProfiles = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        toast.error(`Unable to load users: ${error.message}`)
        setLoading(false)
        return
      }

      setProfiles((data ?? []) as Profile[])
      setLoading(false)
    }

    loadProfiles()
  }, [authLoading, user])

  const counts = useMemo(
    () => ({
      master: profiles.filter((p) => p.role === 'Master').length,
      approver: profiles.filter((p) => p.role === 'Approver').length,
      contributor: profiles.filter((p) => p.role === 'Contributor').length,
    }),
    [profiles]
  )

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isMaster) {
      toast.error('Only the Master user can change roles.')
      return
    }

    if (userId === currentProfile?.id && newRole !== 'Master') {
      toast.error('You cannot remove your own Master role.')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      toast.error(`Unable to update role: ${error.message}`)
      return
    }

    setProfiles((current) =>
      current.map((p) => (p.id === userId ? { ...p, role: newRole } : p))
    )
    toast.success('Role updated successfully.')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Users</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">User management</h1>
            <p className="mt-2 text-sm text-slate-600">
              View all team members and their roles. Only the Master user can change roles.
            </p>
          </header>

          {!isMaster && (
            <div className="rounded-3xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              You are signed in as <strong>{currentProfile?.role}</strong>. Role changes require Master access.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Masters</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{counts.master}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Approvers</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{counts.approver}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Contributors</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{counts.contributor}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">Name</th>
                    <th className="px-6 py-4 font-medium">Email</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Joined</th>
                    {isMaster && <th className="px-6 py-4 font-medium">Change role</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                        Loading users…
                      </td>
                    </tr>
                  ) : profiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    profiles.map((p) => (
                      <tr key={p.id} className={`hover:bg-slate-50 ${p.id === currentProfile?.id ? 'bg-slate-50/60' : ''}`}>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {p.name}
                          {p.id === currentProfile?.id && (
                            <span className="ml-2 text-xs text-slate-400">(you)</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{p.email}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${roleColors[p.role]}`}>
                            {p.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                        {isMaster && (
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              {ROLE_OPTIONS.map((role) => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() => handleRoleChange(p.id, role)}
                                  disabled={p.role === role}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {role}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Role permissions</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-violet-50 p-4">
                <p className="text-sm font-semibold text-violet-800">Master</p>
                <p className="mt-1 text-xs text-violet-700">Full access — can manage users and assign roles. Only one recommended.</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-4">
                <p className="text-sm font-semibold text-sky-800">Approver</p>
                <p className="mt-1 text-xs text-sky-700">Can approve and reject tasks. Cannot manage users or roles.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Contributor</p>
                <p className="mt-1 text-xs text-slate-600">Can create tasks and upload files. Cannot approve or manage users.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
