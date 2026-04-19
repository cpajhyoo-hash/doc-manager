export type UserRole = 'Master' | 'Approver' | 'Contributor'

export type Profile = {
  id: string
  name: string
  email: string
  role: UserRole
  created_at: string
}

export type TaskStatus = 'Draft' | 'Under Review' | 'Approved'

export type TaskFile = {
  id: number
  task_id: number
  file_name: string
  version: string
  file_path: string
  file_url: string
  uploaded_at: string
  deleted_at?: string | null
}

export type Task = {
  id: number
  title: string
  owner: string
  status: TaskStatus
  due_date: string
  created_at: string
  updated_at?: string
  deleted_at?: string | null
  task_files?: TaskFile[]
}

export type DocumentItem = {
  id: number
  file_name: string
  file_path: string
  task_id: number
  version: string
  file_url: string
  uploaded_at: string
  task_title: string
  owner: string
  status: TaskStatus
  due_date: string
}

export const STATUS_OPTIONS: TaskStatus[] = ['Draft', 'Under Review', 'Approved']
export const ROLE_OPTIONS: UserRole[] = ['Master', 'Approver', 'Contributor']
