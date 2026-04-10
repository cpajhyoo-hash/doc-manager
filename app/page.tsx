'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type DocumentItem = {
  id: number
  title: string
  owner: string
  type: string
  version: string
  status: 'Draft' | 'Under Review' | 'Approved'
  due_date: string
  updated_at: string
  file_path?: string
  file_url?: string
}

type ViewOption = 'Overview' | 'Documents' | 'Drafts' | 'Approvals' | 'Reports'
type UploadMode = 'new' | 'version'
type UserRole = 'Master' | 'Approver' | 'Contributor'

const statusOptions = ['Draft', 'Under Review', 'Approved'] as const
const typeOptions = ['Policy', 'Contract', 'Report', 'Memo', 'General'] as const
const viewOptions: ViewOption[] = ['Overview', 'Documents', 'Drafts', 'Approvals', 'Reports']
const userRoles: UserRole[] = ['Master', 'Approver', 'Contributor']
const ownerOptions = ['Legal Team', 'Contract Team', 'Compliance', 'Admin'] as const

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

export default function Home() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Under Review' | 'Approved'>('All')
  const [dueFilter, setDueFilter] = useState<'All' | 'Today' | 'This Week' | 'Overdue'>('All')
  const [selectedView, setSelectedView] = useState<ViewOption>('Overview')
  const [userRole, setUserRole] = useState<UserRole>('Contributor')
  const [roleToAssign, setRoleToAssign] = useState<UserRole>('Contributor')
  const [uploadMode, setUploadMode] = useState<UploadMode>('new')
  const [baseDocumentId, setBaseDocumentId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [newType, setNewType] = useState<string>('Policy')
  const [newVersion, setNewVersion] = useState('v1.0')
  const [newStatus, setNewStatus] = useState<typeof statusOptions[number]>('Draft')
  const [newDueDate, setNewDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [newFile, setNewFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  async function fetchDocuments() {
    const { data, error } = await supabase.from('documents').select('*').order('updated_at', { ascending: false })
    if (error) {
      setMessage(`Unable to load documents: ${error.message}`)
      return
    }

    if (data) {
      const docs = data.map((item: any, index: number) => ({
        id: item.id ?? index,
        title: item.title ?? item.name ?? `Document ${index + 1}`,
        owner: item.owner ?? item.user ?? 'Unknown',
        type: item.type ?? item.category ?? 'General',
        version: item.version ?? 'v1.0',
        status: item.status ?? 'Draft',
        due_date: item.due_date ?? new Date().toISOString().slice(0, 10),
        updated_at: item.updated_at ?? item.created_at ?? new Date().toISOString(),
        file_path: item.file_path,
        file_url: item.file_url,
      })) as DocumentItem[]

      setDocuments(docs)
      setSelectedDocument((current) => current ?? docs[0] ?? null)
    }
  }

  const sameDocumentVersions = useMemo(() => {
    if (!selectedDocument) return []
    return documents
      .filter((doc) => doc.title === selectedDocument.title)
      .sort((a, b) => {
        const aVer = normalizeVersion(a.version)
        const bVer = normalizeVersion(b.version)
        if (aVer.major !== bVer.major) return bVer.major - aVer.major
        return bVer.minor - aVer.minor
      })
  }, [documents, selectedDocument])

  const baseDocument = useMemo(
    () => documents.find((doc) => doc.id === baseDocumentId) ?? null,
    [documents, baseDocumentId]
  )

  useEffect(() => {
    if (uploadMode === 'version' && baseDocument) {
      setNewTitle(baseDocument.title)
      setNewOwner(baseDocument.owner)
      setNewType(baseDocument.type)
      setNewStatus('Draft')
      setNewVersion(getNextVersion(documents.filter((doc) => doc.title === baseDocument.title).map((doc) => doc.version)))
    }
  }, [uploadMode, baseDocument, documents])

  const filteredDocuments = useMemo(() => {
    const now = new Date()

    return documents.filter((doc) => {
      const matchesSearch = [doc.title, doc.owner, doc.type, doc.version].some((value) =>
        value.toLowerCase().includes(search.toLowerCase())
      )

      const matchesStatus =
        statusFilter === 'All' || doc.status === statusFilter

      const matchesView =
        selectedView === 'Drafts'
          ? doc.status === 'Draft'
          : selectedView === 'Approvals'
          ? doc.status === 'Under Review' || doc.status === 'Approved'
          : true

      const due = new Date(doc.due_date)
      const isToday = due.toDateString() === now.toDateString()
      const isThisWeek = (() => {
        const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return diffDays >= 0 && diffDays < 7
      })()
      const isOverdue = due < now && !isToday

      const matchesDue =
        dueFilter === 'All' ||
        (dueFilter === 'Today' && isToday) ||
        (dueFilter === 'This Week' && isThisWeek) ||
        (dueFilter === 'Overdue' && isOverdue)

      return matchesSearch && matchesStatus && matchesView && matchesDue
    })
  }, [documents, search, statusFilter, dueFilter, selectedView])

  const statusCounts = useMemo(() => {
    const counts = { Draft: 0, 'Under Review': 0, Approved: 0 }
    documents.forEach((doc) => {
      counts[doc.status] = (counts[doc.status] ?? 0) + 1
    })
    return counts
  }, [documents])

  const allowedStatusValues = useMemo<readonly DocumentItem['status'][]>(() => {
    if (userRole === 'Master') {
      return ['Draft', 'Under Review', 'Approved']
    }
    if (userRole === 'Approver') {
      return ['Under Review', 'Approved']
    }
    return ['Draft']
  }, [userRole])

  const uploadOptions = [
    { value: 'new', label: 'New Document' },
    { value: 'version', label: 'New Version of Existing Document' },
  ] as const

  const handleSelectView = (view: ViewOption) => {
    setSelectedView(view)
    if (view === 'Drafts') {
      setStatusFilter('Draft')
    } else if (view === 'Approvals') {
      setStatusFilter('All')
    } else {
      setStatusFilter('All')
    }
    setSearch('')
    setDueFilter('All')
  }

  const handleAssignUserRole = () => {
    if (userRole !== 'Master') {
      setMessage('Only the master account can assign user roles.')
      return
    }
    setUserRole(roleToAssign)
    setMessage(`User role assigned: ${roleToAssign}`)
  }

  const uploadFileToStorage = async (file: File) => {
    const filePath = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { data, error } = await supabase.storage.from('documents').upload(filePath, file)

    if (error) {
      console.error('Storage upload error', error)
      return { error, path: '', url: '' }
    }

    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    return { path: filePath, url: publicUrlData.publicUrl ?? '' }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setNewFile(file)
  }

  const handleCreateDocument = async () => {
    if (!newTitle.trim()) {
      setMessage('Document title is required.')
      return
    }
    if (!newOwner.trim()) {
      setMessage('Owner is required.')
      return
    }
    if (!newFile) {
      setMessage('Please choose a file before uploading.')
      return
    }

    setIsSaving(true)
    setMessage(null)

    const upload = await uploadFileToStorage(newFile)
    if (upload.error) {
      setMessage('File upload failed. Please try again.')
      setIsSaving(false)
      return
    }

    let title = newTitle
    let version = newVersion
    let owner = newOwner
    let type = newType

    if (uploadMode === 'version') {
      if (!baseDocument) {
        setMessage('Select an existing document to create a new version.')
        setIsSaving(false)
        return
      }

      title = baseDocument.title
      owner = baseDocument.owner
      type = baseDocument.type
      version = getNextVersion(documents.filter((doc) => doc.title === baseDocument.title).map((doc) => doc.version))
    }

    const { data, error } = await supabase.from('documents').insert({
      title,
      owner,
      type,
      version,
      status: 'Draft',
      due_date: newDueDate,
      file_path: upload.path,
      file_url: upload.url,
    }).select('*').single()

    if (error || !data) {
      setMessage(`Unable to save document: ${error?.message ?? 'Unknown error'}`)
      setIsSaving(false)
      return
    }

    setNewTitle('')
    setNewOwner('')
    setNewType('Policy')
    setNewVersion('v1.0')
    setNewStatus('Draft')
    setNewDueDate(new Date().toISOString().slice(0, 10))
    setNewFile(null)
    setBaseDocumentId(null)
    setMessage('Document uploaded successfully.')
    setIsSaving(false)

    fetchDocuments()
  }

  const handleUpdateDocumentStatus = async (status: DocumentItem['status']) => {
    if (!selectedDocument) {
      setMessage('Select a document first.')
      return
    }
    if (!allowedStatusValues.includes(status)) {
      setMessage('Your role does not allow this status change.')
      return
    }

    setIsSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('documents')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', selectedDocument.id)

    if (error) {
      setMessage(`Unable to update status: ${error.message}`)
      setIsSaving(false)
      return
    }

    setMessage(`Status updated to ${status}.`)
    setIsSaving(false)
    fetchDocuments()
  }

  const handleOpenDocument = () => {
    if (!selectedDocument?.file_url) {
      setMessage('No attached file available for this document.')
      return
    }
    window.open(selectedDocument.file_url, '_blank')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1500px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-md">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Document Hub</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">Docs Dashboard</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Upload, review, approve, and manage legal document versions.</p>
          </div>

          <div className="space-y-2">
            {viewOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSelectView(item)}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  selectedView === item ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-3xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Fast filters</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-600">Draft</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{statusCounts.Draft}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-600">Under Review</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{statusCounts['Under Review']}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-slate-600">Approved</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{statusCounts.Approved}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <header className="flex flex-col gap-4 rounded-3xl bg-white px-6 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Overview</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">Document workflow</h2>
              <p className="mt-2 text-sm text-slate-600">Upload documents, manage versions, and approve with role-based access.</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Your role</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{userRole}</p>
                <div className="mt-4 flex flex-col gap-3">
                  <label className="block text-xs font-medium text-slate-500">Assign role</label>
                  <div className="flex gap-2">
                    <select
                      value={roleToAssign}
                      onChange={(event) => setRoleToAssign(event.target.value as UserRole)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                      disabled={userRole !== 'Master'}
                    >
                      {userRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAssignUserRole}
                      disabled={userRole !== 'Master'}
                      className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Set
                    </button>
                  </div>
                  {userRole !== 'Master' ? (
                    <p className="text-xs text-slate-500">Only the master account can assign roles.</p>
                  ) : (
                    <p className="text-xs text-slate-500">Master account may set each user role.</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Total documents</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{documents.length}</p>
              </div>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Draft documents</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{statusCounts.Draft}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Under review</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{statusCounts['Under Review']}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Approved</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{statusCounts.Approved}</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Document upload mode</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {uploadOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setUploadMode(option.value)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                    uploadMode === option.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {uploadMode === 'version' && (
              <div className="mt-6 rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">Choose existing document</p>
                <select
                  value={baseDocumentId ?? ''}
                  onChange={(event) => setBaseDocumentId(Number(event.target.value) || null)}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none"
                >
                  <option value="">Select a base document</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} · {doc.version}
                    </option>
                  ))}
                </select>
                <p className="mt-3 text-sm text-slate-500">A new version will keep previous versions accessible.</p>
              </div>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Document title</label>
                  <input
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder="Enter document title"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    disabled={uploadMode === 'version' && Boolean(baseDocument)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-700">Owner validation</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ownerOptions.map((owner) => (
                      <button
                        key={owner}
                        type="button"
                        onClick={() => setNewOwner(owner)}
                        disabled={uploadMode === 'version' && Boolean(baseDocument)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                          newOwner === owner
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        } ${uploadMode === 'version' && Boolean(baseDocument) ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        {owner}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Select the validated owner from the list to avoid manual mistakes.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Type</label>
                  <select
                    value={newType}
                    onChange={(event) => setNewType(event.target.value as typeof typeOptions[number])}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    disabled={uploadMode === 'version' && Boolean(baseDocument)}
                  >
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Version</label>
                  <input
                    value={newVersion}
                    onChange={(event) => setNewVersion(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                    disabled
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value as typeof statusOptions[number])}
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
                    value={newDueDate}
                    onChange={(event) => setNewDueDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  />
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">File attachment</p>
                  <p className="mt-2 text-sm text-slate-500">Selected file: {newFile?.name ?? 'None'}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Choose file
              </button>
              <button
                type="button"
                onClick={handleCreateDocument}
                disabled={isSaving}
                className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upload document
              </button>
            </div>
            <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700">Search documents</label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, owner, version or type"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 md:w-[420px]">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as any)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  >
                    <option>All</option>
                    <option>Draft</option>
                    <option>Under Review</option>
                    <option>Approved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Due filter</label>
                  <select
                    value={dueFilter}
                    onChange={(event) => setDueFilter(event.target.value as any)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none"
                  >
                    <option>All</option>
                    <option>Today</option>
                    <option>This Week</option>
                    <option>Overdue</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-lg font-semibold text-slate-900">Document list</h3>
              <p className="mt-1 text-sm text-slate-600">All uploaded versions are listed here with status, version, and upload date.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-medium">Document</th>
                    <th className="px-6 py-4 font-medium">Owner</th>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Version</th>
                    <th className="px-6 py-4 font-medium">Due date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                        No documents match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        onClick={() => setSelectedDocument(doc)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${
                          selectedDocument?.id === doc.id ? 'bg-slate-100' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{doc.title}</div>
                          <div className="mt-1 text-xs text-slate-500">ID {doc.id}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{doc.owner}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.type}</td>
                        <td className="px-6 py-4 text-slate-700">{doc.version}</td>
                        <td className="px-6 py-4 text-slate-700">{new Date(doc.due_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              doc.status === 'Draft'
                                ? 'bg-amber-100 text-amber-700'
                                : doc.status === 'Under Review'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{new Date(doc.updated_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6 xl:h-fit">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Document details</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedDocument ? selectedDocument.title : 'No document selected'}</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{selectedDocument?.status ?? 'Idle'}</span>
          </div>

          {selectedDocument ? (
            <div className="space-y-5">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Current version</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{selectedDocument.version}</p>
                <p className="mt-2 text-sm text-slate-600">Uploaded {new Date(selectedDocument.updated_at).toLocaleDateString()}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">Owner</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{selectedDocument.owner}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">Due date</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{new Date(selectedDocument.due_date).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Status</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">{selectedDocument.status}</p>
              </div>

              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Version history</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  {sameDocumentVersions.map((versioned) => (
                    <li
                      key={versioned.id}
                      className="rounded-2xl bg-white px-4 py-3 shadow-sm transition hover:bg-slate-100 cursor-pointer"
                      onClick={() => setSelectedDocument(versioned)}
                    >
                      <div className="font-semibold text-slate-900">{versioned.version}</div>
                      <div className="text-xs text-slate-500">Uploaded {new Date(versioned.updated_at).toLocaleDateString()}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleOpenDocument}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Open document
                </button>
                <div className="grid gap-3">
                  {['Draft', 'Under Review', 'Approved'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleUpdateDocumentStatus(status as DocumentItem['status'])}
                      disabled={!allowedStatusValues.includes(status as any) || isSaving}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Set {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-50 p-6 text-slate-600">
              Select a document to review details, version history, and approval workflow.
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
