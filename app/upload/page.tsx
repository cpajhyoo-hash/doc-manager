'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'Document'
const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

function normalizeVersion(value: string) {
  const match = value.match(/(\d+)(?:[._]?)(\d+)?/) ?? []
  return { major: Number(match[1] ?? '0'), minor: Number(match[2] ?? '0') }
}

function getNextVersion(existing: string[]) {
  if (existing.length === 0) return 'v1.0'
  const parsed = existing.map(normalizeVersion)
  const highest = parsed.reduce(
    (best, cur) => cur.major > best.major || (cur.major === best.major && cur.minor > best.minor) ? cur : best,
    { major: 0, minor: 0 }
  )
  return `v${highest.major}.${highest.minor + 1}`
}

function mapRawTasks(raw: RawTaskRow[]): Task[] {
  return raw.map((item, index) => ({
    id: item.id ?? index,
    title: item.title ?? `Task ${index + 1}`,
    owner: item.owner ?? 'Unknown',
    status: item.status ?? 'Draft',
    due_date: item.due_date ?? new Date().toISOString().slice(0, 10),
    created_at: item.created_at ?? new Date().toISOString(),
    task_files: (item.task_files ?? []).filter((f) => f.deleted_at == null).map((file) => ({
      id: file.id,
      task_id: file.task_id,
      file_name: file.file_name ?? 'Unnamed file',
      version: file.version ?? 'v1.0',
      file_path: file.file_path ?? '',
      file_url: file.file_url ?? '',
      uploaded_at: file.uploaded_at ?? file.created_at ?? new Date().toISOString(),
    })) as TaskFile[],
  }))
}

export default function UploadPage() {
  const { profile, user, loading } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [ownerOptions, setOwnerOptions] = useState<string[]>([])
  const [taskMode, setTaskMode] = useState<'new' | 'existing'>('new')
  const [selectedTaskId, setSelectedTaskId] = useState<string | number>('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskOwner, setNewTaskOwner] = useState<string>('')
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('Draft')
  const [newTaskDueDate, setNewTaskDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [newFile, setNewFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile?.name && !newTaskOwner) {
      setNewTaskOwner(profile.name)
    }
  }, [profile, newTaskOwner])

  const fetchTasks = useCallback(async () => {
    if (loading || !user) return

    const [taskResult, profileResult] = await Promise.all([
      supabase.from(tasksTable).select('*, task_files(*)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('profiles').select('name').order('name'),
    ])
    if (taskResult.error) { toast.error(`Unable to load tasks: ${taskResult.error.message}`); return }
    setTasks(mapRawTasks((taskResult.data ?? []) as RawTaskRow[]))
    setOwnerOptions((profileResult.data ?? []).map((p: { name: string }) => p.name))
  }, [loading, user])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const selectedTask = useMemo(() => {
    if (taskMode === 'new' || selectedTaskId === '') return null
    return tasks.find((t) => t.id.toString() === selectedTaskId) ?? null
  }, [tasks, taskMode, selectedTaskId])

  const nextVersion = useMemo(() => {
    if (!selectedTask) return 'v1.0'
    return getNextVersion(selectedTask.task_files?.map((f) => f.version) ?? [])
  }, [selectedTask])

  const handleUpload = async () => {
    if (!newFile) { toast.error('Please choose a file to upload.'); return }
    if (taskMode === 'existing' && selectedTaskId === '') { toast.error('Please select an existing task.'); return }
    if (taskMode === 'new' && !newTaskTitle.trim()) { toast.error('Please enter a task title.'); return }

    setIsSaving(true)

    try {
      let task: Task
      if (selectedTask) {
        task = selectedTask
      } else {
        const { data, error } = await supabase
          .from(tasksTable)
          .insert({ title: newTaskTitle.trim(), owner: newTaskOwner, status: newTaskStatus, due_date: newTaskDueDate })
          .select('*')
          .single()
        if (error || !data) throw new Error(error?.message ?? 'Unable to create task.')
        task = data as Task
      }

      const filePath = `${Date.now()}_${newFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { data: storageData, error: storageError } = await supabase.storage
        .from(storageBucket)
        .upload(filePath, newFile)

      if (storageError || !storageData) throw new Error(storageError?.message ?? 'Storage upload failed.')

      const { data: { publicUrl } } = supabase.storage.from(storageBucket).getPublicUrl(filePath)

      const fileRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          file_name: newFile.name,
          version: selectedTask ? nextVersion : 'v1.0',
          file_path: filePath,
          file_url: publicUrl,
          uploaded_at: new Date().toISOString(),
        }),
      })
      if (!fileRes.ok) {
        const { error } = await fileRes.json()
        throw new Error(error ?? 'Failed to save file record.')
      }

      await fetchTasks()
      setTaskMode('existing')
      setSelectedTaskId(task.id)
      setNewTaskTitle('')
      setNewTaskOwner(profile?.name ?? '')
      setNewTaskStatus('Draft')
      setNewTaskDueDate(new Date().toISOString().slice(0, 10))
      setNewFile(null)
      toast.success('File uploaded successfully.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => setNewFile(e.target.files?.[0] ?? null)

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>

        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Upload</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Attach a file to a task</h1>
            <p className="mt-2 text-sm text-slate-600">Choose or create a task, then upload a file to Supabase Storage.</p>
          </header>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Upload target</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['new', 'existing'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setTaskMode(m); setSelectedTaskId('') }}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        taskMode === m
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {m === 'new' ? 'New Task' : 'Existing Task'}
                    </button>
                  ))}
                </div>
              </div>

              {loading && (
                <div className="md:col-span-2 rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">
                  Loading workspace...
                </div>
              )}

              {taskMode === 'existing' ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Select existing task</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  >
                    <option value="">Choose a task</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Task title</label>
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Enter task title"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Owner</label>
                    <select
                      value={newTaskOwner}
                      onChange={(e) => setNewTaskOwner(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    >
                      {ownerOptions.length === 0 ? (
                        <option value={newTaskOwner}>{newTaskOwner || 'Loading users…'}</option>
                      ) : (
                        ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={newTaskStatus}
                      onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Due date</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    />
                  </div>
                </>
              )}

              {selectedTask && (
                <div className="md:col-span-2 rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Selected task</p>
                  <p className="mt-3 text-lg font-semibold text-slate-900">{selectedTask.title}</p>
                  <p className="mt-1 text-sm text-slate-500">Owner: {selectedTask.owner}</p>
                  <p className="mt-1 text-sm text-slate-500">Due: {new Date(selectedTask.due_date).toLocaleDateString()}</p>
                  <p className="mt-1 text-sm text-slate-500">Next version: {nextVersion}</p>
                </div>
              )}

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
                {isSaving ? 'Uploading…' : 'Upload file'}
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Back to Overview
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
