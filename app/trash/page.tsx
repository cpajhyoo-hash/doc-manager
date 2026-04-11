'use client'

import { useEffect, useState } from 'react'
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
  deleted_at?: string
  task_files?: TaskFile[]
}

function getBadgeClasses(status: TaskItem['status']) {
  return status === 'Draft'
    ? 'bg-amber-100 text-amber-700'
    : status === 'Under Review'
    ? 'bg-sky-100 text-sky-700'
    : 'bg-emerald-100 text-emerald-700'
}

export default function TrashPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'
  const taskFilesTable = process.env.NEXT_PUBLIC_SUPABASE_TASK_FILES_TABLE ?? 'task_files'

  useEffect(() => {
    const loadTrash = async () => {
      const { data, error } = await supabase
        .from(tasksTable)
        .select('*, task_files(*)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

      if (error) {
        setMessage(`Unable to load Trash: ${error.message}`)
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
        task_files: (task.task_files ?? []).map((file) => ({
          id: file.id,
          task_id: file.task_id,
          file_name: file.file_name ?? 'Unnamed file',
          version: file.version ?? 'v1.0',
          file_path: file.file_path,
          file_url: file.file_url,
          uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
        })) as TaskFile[],
      })) as TaskItem[]

      setTasks(mapped)
      setMessage(null)
    }

    loadTrash()
  }, [tasksTable])

  const restoreTask = async (taskId: number) => {
    const { error } = await supabase
      .from(tasksTable)
      .update({ deleted_at: null })
      .eq('id', taskId)

    if (error) {
      setMessage(`Unable to restore task: ${error.message}`)
      return
    }

    setTasks((current) => current.filter((task) => task.id !== taskId))
    setMessage('Task restored successfully.')
  }

  const deleteForever = async (taskId: number) => {
    const { error: deleteFilesError } = await supabase
      .from(taskFilesTable)
      .delete()
      .eq('task_id', taskId)

    if (deleteFilesError) {
      setMessage(`Unable to remove attached files: ${deleteFilesError.message}`)
      return
    }

    const { error } = await supabase
      .from(tasksTable)
      .delete()
      .eq('id', taskId)

    if (error) {
      setMessage(`Unable to delete task permanently: ${error.message}`)
      return
    }

    setTasks((current) => current.filter((task) => task.id !== taskId))
    setMessage('Task permanently deleted.')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          {message ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Trash</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Deleted tasks</h1>
            <p className="mt-2 text-sm text-slate-600">Restore tasks or permanently remove them from the system.</p>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">In trash</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Restorable</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((task) => task.deleted_at).length}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Tasks with files</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((task) => (task.task_files?.length ?? 0) > 0).length}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">Task</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Deleted</th>
                    <th className="px-6 py-4 font-medium">Files</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                        No tasks in Trash.
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{task.title}</td>
                        <td className="px-6 py-4 text-slate-700">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(task.status)}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {task.deleted_at ? new Date(task.deleted_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-700">{task.task_files?.length ?? 0}</td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => restoreTask(task.id)}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteForever(task.id)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Delete forever
                            </button>
                          </div>
                        </td>
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
