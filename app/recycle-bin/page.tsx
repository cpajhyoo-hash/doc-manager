'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
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
  task_files?: Array<{
    id: number
    task_id: number
    file_name?: string
    version?: string
    file_path?: string
    file_url?: string
    uploaded_at?: string
    created_at?: string
    deleted_at?: string | null
  }>
}

type DeletedFile = {
  id: number
  file_name: string
  file_path: string
  version: string
  deleted_at: string
  task_id: number
  task_title: string
}

const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'
const taskFilesTable = process.env.NEXT_PUBLIC_SUPABASE_TASK_FILES_TABLE ?? 'task_files'

export default function RecycleBinPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [deletedFiles, setDeletedFiles] = useState<DeletedFile[]>([])

  useEffect(() => {
    const load = async () => {
      const [taskResult, filesResult] = await Promise.all([
        supabase
          .from(tasksTable)
          .select('*, task_files(*)')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
        supabase
          .from(taskFilesTable)
          .select('*, task:tasks(id,title,deleted_at)')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
      ])

      if (taskResult.error) { toast.error(`Unable to load Recycle Bin: ${taskResult.error.message}`); return }

      const rawTasks = (taskResult.data ?? []) as RawTaskRow[]
      setTasks(rawTasks.map((task, index) => ({
        id: task.id ?? index,
        title: task.title ?? `Task ${index + 1}`,
        owner: task.owner ?? 'Unknown',
        status: task.status ?? 'Draft',
        due_date: task.due_date ?? new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        deleted_at: task.deleted_at,
        task_files: (task.task_files ?? []).map((f) => ({
          id: f.id,
          task_id: f.task_id,
          file_name: f.file_name ?? 'Unnamed file',
          version: f.version ?? 'v1.0',
          file_path: f.file_path ?? '',
          file_url: f.file_url ?? '',
          uploaded_at: f.uploaded_at ?? f.created_at ?? new Date().toISOString(),
        })) as TaskFile[],
      })))

      if (!filesResult.error) {
        const rawFiles = (filesResult.data ?? []) as Array<{
          id: number
          file_name?: string
          file_path?: string
          version?: string
          deleted_at: string
          task_id: number
          task?: { id: number; title?: string; deleted_at?: string | null }
        }>
        setDeletedFiles(
          rawFiles
            .filter((f) => f.task?.deleted_at == null)
            .map((f) => ({
              id: f.id,
              file_name: f.file_name ?? 'Unnamed file',
              file_path: f.file_path ?? '',
              version: f.version ?? 'v1.0',
              deleted_at: f.deleted_at,
              task_id: f.task_id,
              task_title: f.task?.title ?? `Task ${f.task_id}`,
            }))
        )
      }
    }
    load()
  }, [])

  const restoreTask = async (taskId: number) => {
    const { error } = await supabase.from(tasksTable).update({ deleted_at: null }).eq('id', taskId)
    if (error) { toast.error(`Unable to restore task: ${error.message}`); return }
    setTasks((cur) => cur.filter((t) => t.id !== taskId))
    toast.success('Task restored.')
  }

  const deleteTaskForever = async (task: Task) => {
    for (const file of task.task_files ?? []) {
      await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: file.id, file_path: file.file_path, permanent: true }),
      })
    }
    const { error: filesError } = await supabase.from(taskFilesTable).delete().eq('task_id', task.id)
    if (filesError) { toast.error(`Unable to remove attached files: ${filesError.message}`); return }
    const { error } = await supabase.from(tasksTable).delete().eq('id', task.id)
    if (error) { toast.error(`Unable to delete task: ${error.message}`); return }
    setTasks((cur) => cur.filter((t) => t.id !== task.id))
    toast.success('Task permanently deleted.')
  }

  const restoreFile = async (fileId: number) => {
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    })
    if (!res.ok) { toast.error('Unable to restore file.'); return }
    setDeletedFiles((cur) => cur.filter((f) => f.id !== fileId))
    toast.success('File restored.')
  }

  const deleteFileForever = async (fileId: number, filePath: string) => {
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, file_path: filePath, permanent: true }),
    })
    if (!res.ok) { toast.error('Unable to delete file.'); return }
    setDeletedFiles((cur) => cur.filter((f) => f.id !== fileId))
    toast.success('File permanently deleted.')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recycle Bin</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Deleted items</h1>
            <p className="mt-2 text-sm text-slate-600">Restore tasks and files or permanently remove them.</p>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Deleted tasks</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Deleted files</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{deletedFiles.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total items</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length + deletedFiles.length}</p>
            </div>
          </div>

          {/* Deleted Tasks */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Deleted Tasks</h2>
            </div>
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
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-500">No deleted tasks.</td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{task.title}</td>
                        <td className="px-6 py-4"><Badge status={task.status} /></td>
                        <td className="px-6 py-4 text-slate-600">
                          {task.deleted_at ? new Date(task.deleted_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{task.task_files?.length ?? 0}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => restoreTask(task.id)}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTaskForever(task)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
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

          {/* Deleted Files */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Deleted Files</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">File</th>
                    <th className="px-6 py-4 font-medium">Task</th>
                    <th className="px-6 py-4 font-medium">Version</th>
                    <th className="px-6 py-4 font-medium">Deleted</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {deletedFiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-500">No deleted files.</td>
                    </tr>
                  ) : (
                    deletedFiles.map((file) => (
                      <tr key={file.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{file.file_name}</td>
                        <td className="px-6 py-4 text-slate-600">{file.task_title}</td>
                        <td className="px-6 py-4 text-slate-600">{file.version}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(file.deleted_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => restoreFile(file.id)}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteFileForever(file.id, file.file_path)}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
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
