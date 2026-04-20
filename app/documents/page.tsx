'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import SidebarNav from '../components/SidebarNav'
import Badge from '../components/Badge'
import type { DocumentItem } from '../lib/types'

type RawDocumentRow = {
  id: number
  file_name?: string
  file_path?: string
  task_id: number
  version?: string
  file_url?: string
  uploaded_at?: string
  deleted_at?: string | null
  task?: {
    title?: string
    owner?: string
    status?: DocumentItem['status']
    due_date?: string
    deleted_at?: string | null
  }
}

export default function DocumentsPage() {
  const { user, loading } = useAuth()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
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
          .from('task_files')
          .select('*, task:tasks(id,title,owner,status,due_date,deleted_at)')
          .order('uploaded_at', { ascending: false })

        if (!active) return
        clearTimeout(timer)
        if (error) {
          toast.error(`Unable to load documents: ${error.message}`)
        } else {
          const raw = (data ?? []) as RawDocumentRow[]
          setDocuments(
            raw
              .filter((item) => item.task?.deleted_at == null && item.deleted_at == null)
              .map((item) => ({
                id: item.id,
                file_name: item.file_name ?? 'Unknown file',
                file_path: item.file_path ?? '',
                task_id: item.task_id,
                version: item.version ?? 'v1.0',
                file_url: item.file_url ?? '',
                uploaded_at: item.uploaded_at ?? new Date().toISOString(),
                task_title: item.task?.title ?? `Task ${item.task_id}`,
                owner: item.task?.owner ?? 'Unknown',
                status: item.task?.status ?? 'Draft',
                due_date: item.task?.due_date ?? new Date().toISOString().slice(0, 10),
              })) as DocumentItem[]
          )
        }
      } catch {}
      if (active) { clearTimeout(timer); setDataLoading(false) }
    })()

    return () => { active = false; clearTimeout(timer) }
  }, [loading, user])

  const deleteDocument = async (docId: number, filePath: string) => {
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: docId, file_path: filePath, permanent: false }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      toast.error(error ?? 'Failed to delete file.')
      return
    }
    setDocuments((cur) => cur.filter((d) => d.id !== docId))
    toast.success('File deleted.')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <SidebarNav />
        </aside>
        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Documents</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">All uploaded files</h1>
            <p className="mt-2 text-sm text-slate-600">Browse every file upload attached to tasks.</p>
          </header>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">File</th>
                    <th className="px-6 py-4 font-medium">Task</th>
                    <th className="px-6 py-4 font-medium">Owner</th>
                    <th className="px-6 py-4 font-medium">Version</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Uploaded</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading || dataLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                        Loading documents...
                      </td>
                    </tr>
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                        No uploaded files found.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {doc.file_url ? (
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {doc.file_name}
                            </a>
                          ) : doc.file_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{doc.task_title}</td>
                        <td className="px-6 py-4 text-slate-600">{doc.owner}</td>
                        <td className="px-6 py-4 text-slate-600">{doc.version}</td>
                        <td className="px-6 py-4"><Badge status={doc.status} /></td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => deleteDocument(doc.id, doc.file_path)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
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
