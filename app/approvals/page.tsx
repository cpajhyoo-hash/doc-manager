'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import SidebarNav from '../components/SidebarNav'
import Badge from '../components/Badge'
import type { Task, TaskFile, TaskStatus } from '../lib/types'

type RawTaskRow = {
  id?: number
  title?: string
  owner?: string
  status?: TaskStatus
  due_date?: string
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  task_files?: Array<{
    id: number
    task_id: number
    file_name?: string
    version?: string
    file_path?: string
    file_url?: string
    uploaded_at?: string
    created_at?: string
  }>
}

const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

export default function ApprovalsPage() {
  const { profile, user, loading } = useAuth()
  const [tasks, setTasks] = useState<(Task & { updated_at: string })[]>([])

  const canApprove = profile?.role === 'Master' || profile?.role === 'Approver'

  useEffect(() => {
    if (loading || !user) return

    const load = async () => {
      const { data, error } = await supabase
        .from(tasksTable)
        .select('*, task_files(*)')
        .is('deleted_at', null)
      if (error) { toast.error(`Unable to load approvals: ${error.message}`); return }

      const raw = (data ?? []) as RawTaskRow[]
      setTasks(
        raw.map((task, index) => ({
          id: task.id ?? index,
          title: task.title ?? `Task ${index + 1}`,
          owner: task.owner ?? 'Unknown',
          status: task.status ?? 'Draft',
          due_date: task.due_date ?? new Date().toISOString().slice(0, 10),
          created_at: task.created_at ?? new Date().toISOString(),
          updated_at: task.updated_at ?? task.created_at ?? new Date().toISOString(),
          task_files: (task.task_files ?? []).map((file) => ({
            id: file.id,
            task_id: file.task_id,
            file_name: file.file_name ?? 'Unknown',
            version: file.version ?? 'v1.0',
            file_path: file.file_path ?? '',
            file_url: file.file_url ?? '',
            uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
          })) as TaskFile[],
        }))
      )
    }
    load()
  }, [loading, user])

  const pendingApprovals = useMemo(() => tasks.filter((t) => t.status === 'Under Review'), [tasks])

  const changeStatus = async (taskId: number, newStatus: TaskStatus) => {
    const { error } = await supabase.from(tasksTable).update({ status: newStatus }).eq('id', taskId)
    if (error) { toast.error(`Unable to update task: ${error.message}`); return }

    setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))

    if (newStatus === 'Approved') {
      const task = tasks.find((t) => t.id === taskId)
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: task?.title,
          taskOwner: task?.owner,
          approverName: profile?.name,
        }),
      })
      toast.success('Task approved. Notification emails sent to all users.')
    } else {
      toast.success('Task returned to Draft.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>
        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Approvals</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Approval queue</h1>
            <p className="mt-2 text-sm text-slate-600">
              {canApprove
                ? 'Review tasks awaiting approval. Approve or return them to Draft.'
                : 'View tasks awaiting approval. Approving requires the Approver or Master role.'}
            </p>
          </header>

          {!canApprove && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You are signed in as <strong>{profile?.role ?? 'Contributor'}</strong>. Approving tasks requires Approver or Master access.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Under Review</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{pendingApprovals.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total tasks</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Approved</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((t) => t.status === 'Approved').length}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">Task</th>
                    <th className="px-6 py-4 font-medium">Owner</th>
                    <th className="px-6 py-4 font-medium">Files</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Updated</th>
                    {canApprove && <th className="px-6 py-4 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={canApprove ? 6 : 5} className="px-6 py-16 text-center text-slate-500">
                        Loading approvals...
                      </td>
                    </tr>
                  ) : pendingApprovals.length === 0 ? (
                    <tr>
                      <td colSpan={canApprove ? 6 : 5} className="px-6 py-16 text-center text-slate-500">
                        No tasks are currently under review.
                      </td>
                    </tr>
                  ) : (
                    pendingApprovals.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{task.title}</td>
                        <td className="px-6 py-4 text-slate-600">{task.owner}</td>
                        <td className="px-6 py-4 text-slate-600">{task.task_files?.length ?? 0}</td>
                        <td className="px-6 py-4"><Badge status={task.status} /></td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(task.updated_at).toLocaleDateString()}
                        </td>
                        {canApprove && (
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => changeStatus(task.id, 'Approved')}
                                className="rounded-2xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => changeStatus(task.id, 'Draft')}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Return to Draft
                              </button>
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
        </section>
      </div>
    </main>
  )
}
