'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import SidebarNav from '../components/SidebarNav'

type TaskFile = {
  id: number
  task_id: number
  file_name: string
  version: string
  file_path: string
  file_url: string
  uploaded_at: string
}

type TaskItem = {
  id: number
  title: string
  owner: string
  status: 'Draft' | 'Under Review' | 'Approved'
  due_date: string
  created_at: string
  updated_at: string
  task_files?: TaskFile[]
}

function getBadgeClasses(status: TaskItem['status']) {
  return status === 'Draft'
    ? 'bg-amber-100 text-amber-700'
    : status === 'Under Review'
    ? 'bg-sky-100 text-sky-700'
    : 'bg-emerald-100 text-emerald-700'
}

export default function ApprovalsPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from(tasksTable)
        .select('*, task_files(*)')
      .is('deleted_at', null)
      if (error) {
        setMessage(`Unable to load approvals: ${error.message}`)
        setTasks([])
        return
      }

      type RawTaskRow = {
        id?: number
        title?: string
        owner?: string
        status?: TaskItem['status']
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

      const rawTasks = (data ?? []) as RawTaskRow[]
      const mapped = rawTasks.map((task, index) => ({
        id: task.id ?? index,
        title: task.title ?? `Task ${index + 1}`,
        owner: task.owner ?? 'Unknown',
        status: task.status ?? 'Draft',
        due_date: task.due_date ?? new Date().toISOString().slice(0, 10),
        deleted_at: task.deleted_at,
        created_at: task.created_at ?? new Date().toISOString(),
        updated_at: task.updated_at ?? task.created_at ?? new Date().toISOString(),
        task_files: (task.task_files ?? []).map((file) => ({
          id: file.id,
          task_id: file.task_id,
          file_name: file.file_name ?? 'Unknown',
          version: file.version ?? 'v1.0',
          file_path: file.file_path,
          file_url: file.file_url,
          uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
        })) as TaskFile[],
      })) as TaskItem[]

      setTasks(mapped)
      setMessage(null)
    }

    loadTasks()
  }, [tasksTable])

  const pendingApprovals = useMemo(
    () => tasks.filter((task) => task.status === 'Under Review'),
    [tasks]
  )

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SidebarNav />
        </aside>
        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Approvals</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Approval queue</h1>
            <p className="mt-2 text-sm text-slate-600">Review tasks awaiting approval and attached files.</p>
          </header>

          {message ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

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
                {tasks.filter((task) => task.status === 'Approved').length}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {pendingApprovals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                        No tasks are currently under review.
                      </td>
                    </tr>
                  ) : (
                    pendingApprovals.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{task.title}</td>
                        <td className="px-6 py-4 text-slate-700">{task.owner}</td>
                        <td className="px-6 py-4 text-slate-700">{task.task_files?.length ?? 0}</td>
                        <td className="px-6 py-4 text-slate-700">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(task.status)}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{new Date(task.updated_at).toLocaleDateString()}</td>
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
