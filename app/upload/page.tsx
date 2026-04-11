'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
  task_files?: TaskFile[]
}

const ownerOptions = ['Legal Team', 'Contract Team', 'Compliance', 'Admin'] as const
const statusOptions = ['Draft', 'Under Review', 'Approved'] as const

function normalizeVersion(value: string) {
  const match = value.match(/(\d+)(?:[._]?)(\d+)?/) ?? []
  const major = Number(match[1] ?? '0')
  const minor = Number(match[2] ?? '0')
  return { major, minor }
}

function formatVersion(major: number, minor: number) {
  return `v${major}.${minor}`
}

function getNextVersion(existingVersions: string[]) {
  if (existingVersions.length === 0) {
    return 'v1.0'
  }

  const parsed = existingVersions.map(normalizeVersion)
  const highest = parsed.reduce(
    (best, current) => {
      if (current.major > best.major) return current
      if (current.major === best.major && current.minor > best.minor) return current
      return best
    },
    { major: 0, minor: 0 }
  )

  return formatVersion(highest.major, highest.minor + 1)
}

export default function UploadPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [taskMode, setTaskMode] = useState<'new' | 'existing'>('new')
  const [selectedTaskId, setSelectedTaskId] = useState<string | number>('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskOwner, setNewTaskOwner] = useState<typeof ownerOptions[number]>('Legal Team')
  const [newTaskStatus, setNewTaskStatus] = useState<TaskItem['status']>('Draft')
  const [newTaskDueDate, setNewTaskDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [newFile, setNewFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'Document'
  const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'
  const taskFilesTable = process.env.NEXT_PUBLIC_SUPABASE_TASK_FILES_TABLE ?? 'task_files'

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from(tasksTable)
      .select('*, task_files(*)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      setTasks([])
      setMessage(`Unable to load tasks: ${error.message}`)
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
    const mappedTasks = rawTasks.map((item, index) => ({
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
        file_path: file.file_path,
        file_url: file.file_url,
        uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
      })) as TaskFile[],
    })) as TaskItem[]

    setTasks(mappedTasks)
    setMessage(null)
  }, [tasksTable])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const selectedTask = useMemo(() => {
    if (taskMode === 'new' || selectedTaskId === '') return null
    return tasks.find((task) => task.id.toString() === selectedTaskId) ?? null
  }, [tasks, taskMode, selectedTaskId])

  const nextVersion = useMemo(() => {
    if (!selectedTask) return 'v1.0'
    return getNextVersion(selectedTask.task_files?.map((file) => file.version) ?? [])
  }, [selectedTask])

  const uploadFileToStorage = async (file: File) => {
    const filePath = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { data, error } = await supabase.storage.from(storageBucket).upload(filePath, file)

    if (error || !data) {
      return { error, path: '', url: '' }
    }

    const { data: publicUrlData } = supabase.storage.from(storageBucket).getPublicUrl(filePath)
    return {
      path: filePath,
      url: publicUrlData?.publicUrl ?? '',
      error: error ?? null,
    }
  }

  const createTask = async () => {
    const { data, error } = await supabase
      .from(tasksTable)
      .insert({
        title: newTaskTitle.trim(),
        owner: newTaskOwner,
        status: newTaskStatus,
        due_date: newTaskDueDate,
      })
      .select('*')
      .single()

    if (error || !data) {
      throw new Error(error?.message ?? 'Unable to create task.')
    }

    return data as TaskItem
  }

  const saveTaskFile = async ({
    taskId,
    fileName,
    version,
    filePath,
    fileUrl,
  }: {
    taskId: number
    fileName: string
    version: string
    filePath: string
    fileUrl: string
  }) => {
    return await supabase
      .from(taskFilesTable)
      .insert({
        task_id: taskId,
        file_name: fileName,
        version,
        file_path: filePath,
        file_url: fileUrl,
        uploaded_at: new Date().toISOString(),
      })
      .select('*')
      .single()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setNewFile(file)
  }

  const handleUpload = async () => {
    if (!newFile) {
      setMessage('Please choose a file to upload.')
      return
    }

    if (taskMode === 'existing' && selectedTaskId === '') {
      setMessage('Please select an existing task before uploading.')
      return
    }

    if (taskMode === 'new' && !newTaskTitle.trim()) {
      setMessage('Please enter a task title.')
      return
    }

    setIsSaving(true)
    setMessage('Uploading file...')

    try {
      const task = selectedTask ?? (await createTask())
      const upload = await uploadFileToStorage(newFile)

      if (upload.error) {
        setMessage(upload.error.message ?? 'Storage upload failed. Please try again.')
        setIsSaving(false)
        return
      }

      const fileVersion = selectedTask ? nextVersion : 'v1.0'
      const { error } = await saveTaskFile({
        taskId: task.id,
        fileName: newFile.name,
        version: fileVersion,
        filePath: upload.path,
        fileUrl: upload.url,
      })

      if (error) {
        setMessage(`Unable to save file metadata: ${error.message}`)
        setIsSaving(false)
        return
      }

      await fetchTasks()
      setTaskMode('existing')
      setSelectedTaskId(task.id)
      setNewTaskTitle('')
      setNewTaskOwner('Legal Team')
      setNewTaskStatus('Draft')
      setNewTaskDueDate(new Date().toISOString().slice(0, 10))
      setNewFile(null)
      setMessage('File uploaded and task metadata saved successfully.')
    } catch (uploadError) {
      setMessage(
        uploadError instanceof Error ? uploadError.message : 'Unable to complete upload.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Upload</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Attach a file to a task</h1>
            <p className="mt-2 text-sm text-slate-600">Choose or create a task, then upload a file to Supabase Storage.</p>
          </header>

          {message ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Upload target</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTaskMode('new')
                      setSelectedTaskId('')
                    }}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      taskMode === 'new'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    New Task
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskMode('existing')
                      setSelectedTaskId('')
                    }}
                    className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      taskMode === 'existing'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Existing Task
                  </button>
                </div>
              </div>

              {taskMode === 'existing' ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Select existing task</label>
                  <select
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  >
                    <option value="">Choose a task</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title} ({task.status})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Task title</label>
                    <input
                      value={newTaskTitle}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      placeholder="Enter task title"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Owner</label>
                    <select
                      value={newTaskOwner}
                      onChange={(event) => setNewTaskOwner(event.target.value as typeof ownerOptions[number])}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    >
                      {ownerOptions.map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={newTaskStatus}
                      onChange={(event) => setNewTaskStatus(event.target.value as TaskItem['status'])}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    >
                      {statusOptions.map((status) => (
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
                      value={newTaskDueDate}
                      onChange={(event) => setNewTaskDueDate(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    />
                  </div>
                </>
              )}

              {selectedTask ? (
                <div className="md:col-span-2 rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Selected task</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{selectedTask.title}</p>
                  <p className="mt-1 text-sm text-slate-500">Owner: {selectedTask.owner}</p>
                  <p className="mt-1 text-sm text-slate-500">Due: {new Date(selectedTask.due_date).toLocaleDateString()}</p>
                  <p className="mt-1 text-sm text-slate-500">Next version: {nextVersion}</p>
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-slate-700">Version</label>
                <input
                  value={nextVersion}
                  readOnly
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-900 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">File</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Upload file'}
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Back to Overview
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-50 p-6 shadow-sm">
            <p className="text-sm font-medium">Supabase mapping</p>
            <p className="mt-2 text-sm text-slate-500">Bucket: <strong>{storageBucket}</strong></p>
            <p className="mt-1 text-sm text-slate-500">Tasks table: <strong>{tasksTable}</strong></p>
            <p className="mt-1 text-sm text-slate-500">Files table: <strong>{taskFilesTable}</strong></p>
          </div>
        </section>
      </div>
    </main>
  )
}
