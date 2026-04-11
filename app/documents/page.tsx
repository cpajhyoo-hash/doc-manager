'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SidebarNav from '../components/SidebarNav'

type DocumentItem = {
  id: number
  file_name: string
  task_id: number
  version: string
  file_url: string
  uploaded_at: string
  task_title: string
  owner: string
  status: 'Draft' | 'Under Review' | 'Approved'
  due_date: string
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadDocuments = async () => {
      const { data, error } = await supabase
        .from('task_files')
        .select('*, task:tasks(id,title,owner,status,due_date)')
        .order('uploaded_at', { ascending: false })

      if (error) {
        setMessage(`Unable to load documents: ${error.message}`)
        setDocuments([])
        return
      }

      type RawDocumentRow = {
        id: number
        file_name?: string
        task_id: number
        version?: string
        file_url?: string
        uploaded_at?: string
        task?: {
          title?: string
          owner?: string
          status?: DocumentItem['status']
          due_date?: string
          deleted_at?: string
        }
      }

      const rawDocuments = (data ?? []) as RawDocumentRow[]
      const mapped = rawDocuments
        .filter((item) => item.task?.deleted_at == null)
        .map((item) => ({
          id: item.id,
          file_name: item.file_name ?? 'Unknown file',
          task_id: item.task_id,
          version: item.version ?? 'v1.0',
          file_url: item.file_url ?? '',
          uploaded_at: item.uploaded_at ?? new Date().toISOString(),
          task_title: item.task?.title ?? `Task ${item.task_id}`,
          owner: item.task?.owner ?? 'Unknown',
          status: item.task?.status ?? 'Draft',
          due_date: item.task?.due_date ?? new Date().toISOString().slice(0, 10),
        })) as DocumentItem[]

      setDocuments(mapped)
      setMessage(null)
    }

    loadDocuments()
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SidebarNav />
        </aside>
        <section className="space-y-6">
          <header className="rounded-3xl bg-white px-6 py-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Documents</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">All uploaded files</h1>
            <p className="mt-2 text-sm text-slate-600">Browse every file upload attached to tasks.</p>
          </header>

          {message ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          ) : null}

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-500">
                        No uploaded files found.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{doc.file_name}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.task_title}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.owner}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.version}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.status}</td>
                        <td className="px-6 py-4 text-slate-700">{new Date(doc.uploaded_at).toLocaleDateString()}</td>
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
