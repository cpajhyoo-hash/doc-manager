'use client'

import { useMemo, useState } from 'react'
import SidebarNav from '../components/SidebarNav'

type UserRole = 'Master' | 'Approver' | 'Contributor'

type AppUser = {
  id: number
  name: string
  email: string
  role: UserRole
}

const roleOptions: UserRole[] = ['Master', 'Approver', 'Contributor']
const defaultUsers: AppUser[] = [
  { id: 1, name: 'Anna Kim', email: 'anna.kim@example.com', role: 'Master' },
  { id: 2, name: 'Jae Lee', email: 'jae.lee@example.com', role: 'Approver' },
  { id: 3, name: 'Min Cho', email: 'min.cho@example.com', role: 'Contributor' },
]

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>(defaultUsers)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('Master')
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('Contributor')
  const [message, setMessage] = useState<string | null>(null)

  const isMaster = currentUserRole === 'Master'

  const activeCounts = useMemo(
    () => ({
      master: users.filter((user) => user.role === 'Master').length,
      approver: users.filter((user) => user.role === 'Approver').length,
      contributor: users.filter((user) => user.role === 'Contributor').length,
    }),
    [users]
  )

  const handleAddUser = () => {
    if (!isMaster) {
      setMessage('Only the master role can add new users.')
      return
    }
    if (!newUserName.trim() || !newUserEmail.trim()) {
      setMessage('Name and email are required to add a user.')
      return
    }

    const nextId = Math.max(0, ...users.map((user) => user.id)) + 1
    setUsers((current) => [
      ...current,
      { id: nextId, name: newUserName.trim(), email: newUserEmail.trim(), role: newUserRole },
    ])
    setNewUserName('')
    setNewUserEmail('')
    setNewUserRole('Contributor')
    setMessage('User added successfully.')
  }

  const handleRoleChange = (id: number, role: UserRole) => {
    if (!isMaster) {
      setMessage('Only the master role can change user roles.')
      return
    }
    setUsers((current) => current.map((user) => (user.id === id ? { ...user, role } : user)))
    setMessage('User role updated.')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Users</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">User management</h1>
            <p className="mt-2 text-sm text-slate-600">Manage application users and assign their roles.</p>
          </header>

          {message ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Current role</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{currentUserRole}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Approvers</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{activeCounts.approver}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Contributors</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{activeCounts.contributor}</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Current role</label>
                <select
                  value={currentUserRole}
                  onChange={(event) => setCurrentUserRole(event.target.value as UserRole)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Add new user</label>
                <div className="mt-2 space-y-3">
                  <input
                    value={newUserName}
                    onChange={(event) => setNewUserName(event.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  />
                  <input
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    placeholder="Email address"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  />
                  <select
                    value={newUserRole}
                    onChange={(event) => setNewUserRole(event.target.value as UserRole)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddUser}
                    disabled={!isMaster}
                    className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add user
                  </button>
                </div>
              </div>
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
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{user.name}</td>
                      <td className="px-6 py-4 text-slate-700">{user.email}</td>
                      <td className="px-6 py-4 text-slate-700">{user.role}</td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="flex flex-wrap gap-2">
                          {roleOptions.map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => handleRoleChange(user.id, role)}
                              disabled={!isMaster}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
