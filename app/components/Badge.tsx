import type { TaskStatus } from '../lib/types'

const classes: Record<TaskStatus, string> = {
  Draft: 'bg-amber-100 text-amber-700',
  'Under Review': 'bg-sky-100 text-sky-700',
  Approved: 'bg-emerald-100 text-emerald-700',
}

export default function Badge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes[status]}`}>
      {status}
    </span>
  )
}
