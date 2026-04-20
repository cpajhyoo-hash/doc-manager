'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import SidebarNav from '../components/SidebarNav'
import type { Task, TaskFile, TaskStatus } from '../lib/types'
import { STATUS_OPTIONS } from '../lib/types'

type RawTaskRow = {
  id?: number
  title?: string
  owner?: string
  status?: TaskStatus
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
    deleted_at?: string | null
  }>
}

const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

function mapRaw(raw: RawTaskRow[]): Task[] {
  return raw.map((task, index) => ({
    id: task.id ?? index,
    title: task.title ?? `Task ${index + 1}`,
    owner: task.owner ?? 'Unknown',
    status: task.status ?? 'Draft',
    due_date: task.due_date ?? new Date().toISOString().slice(0, 10),
    created_at: task.created_at ?? new Date().toISOString(),
    task_files: (task.task_files ?? []).filter((f) => f.deleted_at == null).map((file) => ({
      id: file.id,
      task_id: file.task_id,
      file_name: file.file_name ?? 'Unknown file',
      version: file.version ?? 'v1.0',
      file_path: file.file_path ?? '',
      file_url: file.file_url ?? '',
      uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
    })) as TaskFile[],
  }))
}

export default function TasksPage() {
  const { profile, user, loading } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [ownerOptions, setOwnerOptions] = useState<string[]>([])
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])
  const [dueDateFilter, setDueDateFilter] = useState<'All' | 'This Week'>('All')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [editValues, setEditValues] = useState<{
    title: string
    owner: string
    status: TaskStatus
    due_date: string
  }>({ title: '', owner: 'Legal Team', status: 'Draft', due_date: new Date().toISOString().slice(0, 10) })

  const canApprove = profile?.role === 'Master' || profile?.role === 'Approver'

  useEffect(() => {
    if (loading) return
    if (!user) { setDataLoading(false); return }

    const load = async () => {
      setDataLoading(true)
      try {
        const [taskResult, profileResult] = await Promise.all([
          supabase.from(tasksTable).select('*, task_files(*)').is('deleted_at', null).order('created_at', { ascending: false }),
          supabase.from('profiles').select('name').order('name'),
        ])
        if (taskResult.error) {
          toast.error(`Unable to load tasks: ${taskResult.error.message}`)
        } else {
          setTasks(mapRaw((taskResult.data ?? []) as RawTaskRow[]))
          setOwnerOptions((profileResult.data ?? []).map((p: { name: string }) => p.name))
        }
      } catch {}
      setDataLoading(false)
    }
    load()
  }, [loading, user])

  const updateTaskStatus = async (taskId: number, status: TaskStatus) => {
    if (status === 'Approved' && !canApprove) {
      toast.error('Only Approvers and Masters can approve tasks.')
      return
    }
    const { error } = await supabase.from(tasksTable).update({ status }).eq('id', taskId)
    if (error) { toast.error(`Unable to update status: ${error.message}`); return }
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)))
    toast.success('Status updated.')
  }

  const moveToTrash = async (taskId: number) => {
    const { error } = await supabase.from(tasksTable).update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
    if (error) { toast.error(`Unable to move to Trash: ${error.message}`); return }
    setTasks((cur) => cur.filter((t) => t.id !== taskId))
    toast.success('Task moved to Trash.')
  }

  const saveEdits = async (taskId: number) => {
    if (!editValues.title.trim()) { toast.error('Task title cannot be empty.'); return }
    const { error } = await supabase.from(tasksTable).update({
      title: editValues.title.trim(),
      owner: editValues.owner,
      status: editValues.status,
      due_date: editValues.due_date,
    }).eq('id', taskId)
    if (error) { toast.error(`Unable to save task: ${error.message}`); return }
    setTasks((cur) => cur.map((t) => t.id === taskId ? { ...t, ...editValues, title: editValues.title.trim() } : t))
    setEditingTaskId(null)
    toast.success('Task updated.')
  }

  const filteredTasks = useMemo(() => {
    if (dueDateFilter !== 'This Week') return tasks
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + 7)
    return tasks.filter((t) => {
      const d = new Date(t.due_date)
      return d >= today && d <= nextWeek
    })
  }, [tasks, dueDateFilter])

  const startEdit = (task: Task) => {
    setEditingTaskId(task.id)
    setEditValues({ title: task.title, owner: task.owner, status: task.status, due_date: task.due_date || new Date().toISOString().slice(0, 10) })
    setExpandedTaskIds((cur) => cur.includes(task.id) ? cur : [...cur, task.id])
  }

  const deleteFile = async (fileId: number, filePath: string) => {
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, file_path: filePath, permanent: false }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error ?? 'Failed to delete file.')
      return
    }
    setTasks((cur) => cur.map((t) => ({
      ...t,
      task_files: t.task_files?.filter((f) => f.id !== fileId),
    })))
    toast.success('File deleted.')
  }

  const toggleExpand = (taskId: number) =>
    setExpandedTaskIds((cur) => cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId])

  const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, taskId: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(taskId) }
  }

  const availableStatuses = canApprove ? STATUS_OPTIONS : STATUS_OPTIONS.filter((s) => s !== 'Approved')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Tasks</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Task list</h1>
            <p className="mt-2 text-sm text-slate-600">Browse tasks, see status badges, and expand to view uploaded files.</p>
          </header>

          <div className="rounded-3xl bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Due date filter</p>
                <p className="mt-1 text-sm text-slate-500">Show only tasks due within the next 7 days.</p>
              </div>
              <select
                value={dueDateFilter}
                onChange={(e) => setDueDateFilter(e.target.value as 'All' | 'This Week')}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
              >
                <option value="All">All tasks</option>
                <option value="This Week">This Week</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total tasks</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{tasks.length}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Tasks with files</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((t) => (t.task_files?.length ?? 0) > 0).length}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Under review</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((t) => t.status === 'Under Review').length}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {loading || dataLoading ? (
              <div className="rounded-3xl bg-white p-6 shadow-sm text-slate-600">
                Loading tasks...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="rounded-3xl bg-white p-6 shadow-sm text-slate-600">
                {tasks.length === 0 ? 'No tasks found.' : 'No tasks match the current filter.'}
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isExpanded = expandedTaskIds.includes(task.id)
                return (
                  <div key={task.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpand(task.id)}
                      onKeyDown={(e) => handleCardKeyDown(e, task.id)}
                      className="w-full cursor-pointer px-6 py-5 text-left focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">{task.title}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {task.task_files?.length ?? 0} file{(task.task_files?.length ?? 0) === 1 ? '' : 's'} · Owner: {task.owner}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <select
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900 outline-none"
                          >
                            {availableStatuses.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEdit(task) }}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); moveToTrash(task.id) }}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                          <span className="text-xs text-slate-400">{isExpanded ? 'Hide files' : 'View files'}</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 px-6 py-5">
                        {editingTaskId === task.id && (
                          <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Task title</label>
                                <input
                                  value={editValues.title}
                                  onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Owner</label>
                                <select
                                  value={editValues.owner}
                                  onChange={(e) => setEditValues((v) => ({ ...v, owner: e.target.value }))}
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                >
                                  {ownerOptions.length === 0
                                    ? <option value={editValues.owner}>{editValues.owner}</option>
                                    : ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Status</label>
                                <select
                                  value={editValues.status}
                                  onChange={(e) => setEditValues((v) => ({ ...v, status: e.target.value as TaskStatus }))}
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                >
                                  {availableStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Due date</label>
                                <input
                                  type="date"
                                  value={editValues.due_date}
                                  onChange={(e) => setEditValues((v) => ({ ...v, due_date: e.target.value }))}
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                />
                              </div>
                            </div>
                            <div className="mt-4 flex gap-3">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); saveEdits(task.id) }}
                                className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                              >
                                Save changes
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingTaskId(null) }}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {task.task_files?.length ? (
                          <ul className="space-y-3">
                            {task.task_files.map((file) => (
                              <li key={file.id} className="rounded-2xl bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    {file.file_url ? (
                                      <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-900 hover:underline">
                                        {file.file_name}
                                      </a>
                                    ) : (
                                      <div className="font-semibold text-slate-900">{file.file_name}</div>
                                    )}
                                    <div className="mt-1 text-xs text-slate-500">
                                      Uploaded {new Date(file.uploaded_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                      {file.version}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); deleteFile(file.id, file.file_path) }}
                                      className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rounded-3xl bg-white p-4 text-sm text-slate-600">No files attached yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
