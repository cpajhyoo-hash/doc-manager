'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from './lib/supabase'
import { useAuth } from './lib/auth-context'
import SidebarNav from './components/SidebarNav'
import Badge from './components/Badge'
import type { Task, TaskFile } from './lib/types'

type RawTaskRow = {
  id?: number
  title?: string
  owner?: string
  status?: Task['status']
  due_date?: string
  deleted_at?: string | null
  created_at?: string
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

export default function Home() {
  const { profile, user, loading } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!user) { setDataLoading(false); return }

    let active = true
    const timer = setTimeout(() => { if (active) setDataLoading(false) }, 10_000)

    ;(async () => {
      setDataLoading(true)
      try {
        const { data, error } = await supabase
          .from(tasksTable)
          .select('*, task_files(*)')
          .is('deleted_at', null)
        if (!active) return
        clearTimeout(timer)
        if (!error) {
          const rawTasks = (data ?? []) as RawTaskRow[]
          setTasks(
            rawTasks.map((item, index) => ({
              id: item.id ?? index,
              title: item.title ?? `Task ${index + 1}`,
              owner: item.owner ?? 'Unknown',
              status: item.status ?? 'Draft',
              due_date: item.due_date ?? new Date().toISOString().slice(0, 10),
              created_at: item.created_at ?? new Date().toISOString(),
              task_files: (item.task_files ?? []).map((file) => ({
                id: file.id,
                task_id: file.task_id,
                file_name: file.file_name ?? 'Unnamed file',
                version: file.version ?? 'v1.0',
                file_path: file.file_path ?? '',
                file_url: file.file_url ?? '',
                uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
              })) as TaskFile[],
            }))
          )
        }
      } catch {}
      if (active) { clearTimeout(timer); setDataLoading(false) }
    })()

    return () => { active = false; clearTimeout(timer) }
  }, [loading, user])

  const totalFiles = useMemo(
    () => tasks.reduce((sum, task) => sum + (task.task_files?.length ?? 0), 0),
    [tasks]
  )

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Overview</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              {profile ? `Welcome, ${profile.name}` : 'Task and file dashboard'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Live overview of task counts, approval status, and uploaded files.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total tasks</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Under review</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((t) => t.status === 'Under Review').length}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Approved</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((t) => t.status === 'Approved').length}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total files</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{totalFiles}</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Quick actions</p>
                <p className="mt-2 text-sm text-slate-600">
                  Jump directly to the task list, upload workflow, or user role management.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link href="/tasks" className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white text-center transition hover:bg-slate-700">
                  View tasks
                </Link>
                <Link href="/upload" className="rounded-2xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900 text-center transition hover:bg-slate-100">
                  Upload file
                </Link>
                <Link href="/users" className="rounded-2xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900 text-center transition hover:bg-slate-100">
                  Manage users
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Recent tasks</p>
                <p className="mt-1 text-sm text-slate-500">Latest tasks with current status and attachment counts.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {tasks.length} total
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {loading || dataLoading ? (
                <div className="rounded-3xl bg-slate-50 p-5 text-slate-500">Loading dashboard...</div>
              ) : tasks.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-5 text-slate-500">No tasks available yet.</div>
              ) : (
                tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{task.title}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {task.task_files?.length ?? 0} attached file{(task.task_files?.length ?? 0) === 1 ? '' : 's'}
                        </div>
                      </div>
                      <Badge status={task.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
