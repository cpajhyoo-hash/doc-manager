'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
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
  deleted_at?: string
  task_files?: TaskFile[]
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [dueDateFilter, setDueDateFilter] = useState<'All' | 'This Week'>('All')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editTaskValues, setEditTaskValues] = useState<{
    title: string
    owner: string
    status: TaskItem['status']
    due_date: string
  }>({
    title: '',
    owner: 'Legal Team',
    status: 'Draft',
    due_date: new Date().toISOString().slice(0, 10),
  })
  const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from(tasksTable)
        .select('*, task_files(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        setMessage(`Unable to load tasks: ${error.message}`)
        setTasks([])
        return
      }

      type RawTaskRow = {
        id?: number
        title?: string
        owner?: string
        status?: TaskItem['status']
        due_date?: string
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

      const rawTasks = (data ?? []) as RawTaskRow[]
      const mapped = rawTasks.map((task, index) => ({
        id: task.id ?? index,
        title: task.title ?? `Task ${index + 1}`,
        owner: task.owner ?? 'Unknown',
        status: task.status ?? 'Draft',
        due_date: task.due_date ?? new Date().toISOString().slice(0, 10),
        created_at: task.created_at ?? new Date().toISOString(),
        task_files: (task.task_files ?? []).map((file) => ({
          id: file.id,
          task_id: file.task_id,
          file_name: file.file_name ?? 'Unknown file',
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

  const updateTaskStatus = async (taskId: number, status: TaskItem['status']) => {
    const { error } = await supabase
      .from(tasksTable)
      .update({ status })
      .eq('id', taskId)

    if (error) {
      setMessage(`Unable to update status: ${error.message}`)
      return
    }

    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)))
  }

  const moveTaskToTrash = async (taskId: number) => {
    const { error } = await supabase
      .from(tasksTable)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)

    if (error) {
      setMessage(`Unable to move task to Trash: ${error.message}`)
      return
    }

    setTasks((current) => current.filter((task) => task.id !== taskId))
    setMessage('Task moved to Trash.')
  }

  const filteredTasks = useMemo(() => {
    if (dueDateFilter !== 'This Week') return tasks

    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + 7)

    const normalize = (dateString: string) => new Date(dateString)
    return tasks.filter((task) => {
      const dueDate = normalize(task.due_date)
      return dueDate >= today && dueDate <= nextWeek
    })
  }, [tasks, dueDateFilter])

  const startEditingTask = (task: TaskItem) => {
    setEditingTaskId(task.id)
    setEditTaskValues({
      title: task.title,
      owner: task.owner,
      status: task.status,
      due_date: task.due_date || new Date().toISOString().slice(0, 10),
    })
    setExpandedTaskIds((current) => (current.includes(task.id) ? current : [...current, task.id]))
  }

  const cancelEdit = () => setEditingTaskId(null)

  const saveTaskEdits = async (taskId: number) => {
    if (!editTaskValues.title.trim()) {
      setMessage('Task title cannot be empty.')
      return
    }

    const { error } = await supabase
      .from(tasksTable)
      .update({
        title: editTaskValues.title.trim(),
        owner: editTaskValues.owner,
        status: editTaskValues.status,
        due_date: editTaskValues.due_date,
      })
      .eq('id', taskId)

    if (error) {
      setMessage(`Unable to save task: ${error.message}`)
      return
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...editTaskValues, title: editTaskValues.title.trim() } : task
      )
    )
    setEditingTaskId(null)
    setMessage('Task updated successfully.')
  }

  const toggleExpand = (taskId: number) => {
    setExpandedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    )
  }

  const handleTaskCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, taskId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleExpand(taskId)
    }
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
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Tasks</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Task list</h1>
            <p className="mt-2 text-sm text-slate-600">Browse tasks, see status badges, and expand a task to view uploaded files.</p>
          </header>

          <div className="rounded-3xl bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Due date filter</p>
                <p className="mt-1 text-sm text-slate-500">Show only tasks due within the next 7 days.</p>
              </div>
              <div>
                <label htmlFor="due-filter" className="sr-only">Due date filter</label>
                <select
                  id="due-filter"
                  value={dueDateFilter}
                  onChange={(event) => setDueDateFilter(event.target.value as 'All' | 'This Week')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                >
                  <option value="All">All tasks</option>
                  <option value="This Week">This Week</option>
                </select>
              </div>
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
                {tasks.filter((task) => (task.task_files?.length ?? 0) > 0).length}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Under review</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {tasks.filter((task) => task.status === 'Under Review').length}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {filteredTasks.length === 0 ? (
              <div className="rounded-3xl bg-white p-6 shadow-sm text-slate-600">
                {tasks.length === 0
                  ? 'No tasks found.'
                  : dueDateFilter === 'This Week'
                  ? 'No tasks due within 7 days.'
                  : 'No tasks match the current filter.'}
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
                      onKeyDown={(event) => handleTaskCardKeyDown(event, task.id)}
                      className="w-full cursor-pointer px-6 py-5 text-left focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">{task.title}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {task.task_files?.length ?? 0} attached file{(task.task_files?.length ?? 0) === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <select
                            value={task.status}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskItem['status'])}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900 outline-none"
                          >
                            {['Draft', 'Under Review', 'Approved'].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              moveTaskToTrash(task.id)
                            }}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              startEditingTask(task)
                            }}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <span className="text-xs text-slate-500">{isExpanded ? 'Hide files' : 'View files'}</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 px-6 py-5">
                        {editingTaskId === task.id && (
                          <div className="rounded-3xl bg-white p-4 shadow-sm">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Task title</label>
                                <input
                                  value={editTaskValues.title}
                                  onChange={(event) =>
                                    setEditTaskValues((current) => ({ ...current, title: event.target.value }))
                                  }
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Owner</label>
                                <select
                                  value={editTaskValues.owner}
                                  onChange={(event) =>
                                    setEditTaskValues((current) => ({
                                      ...current,
                                      owner: event.target.value,
                                    }))
                                  }
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                >
                                  {['Legal Team', 'Contract Team', 'Compliance', 'Admin'].map((owner) => (
                                    <option key={owner} value={owner}>
                                      {owner}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Status</label>
                                <select
                                  value={editTaskValues.status}
                                  onChange={(event) =>
                                    setEditTaskValues((current) => ({
                                      ...current,
                                      status: event.target.value as TaskItem['status'],
                                    }))
                                  }
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                >
                                  {['Draft', 'Under Review', 'Approved'].map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700">Due date</label>
                                <input
                                  type="date"
                                  value={editTaskValues.due_date}
                                  onChange={(event) =>
                                    setEditTaskValues((current) => ({
                                      ...current,
                                      due_date: event.target.value,
                                    }))
                                  }
                                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                                />
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  saveTaskEdits(task.id)
                                }}
                                className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                              >
                                Save changes
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  cancelEdit()
                                }}
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
                                    <div className="font-semibold text-slate-900">{file.file_name}</div>
                                    <div className="mt-1 text-xs text-slate-500">Uploaded {new Date(file.uploaded_at).toLocaleDateString()}</div>
                                  </div>
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    {file.version}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rounded-3xl bg-white p-4 text-sm text-slate-600">No files attached to this task yet.</div>
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
