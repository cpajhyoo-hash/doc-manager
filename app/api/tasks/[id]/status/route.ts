import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAdminClient } from '../../../../lib/supabase-admin'
import type { TaskStatus } from '../../../../lib/types'

const tasksTable = process.env.NEXT_PUBLIC_SUPABASE_TASKS_TABLE ?? 'tasks'

function makeSupabase(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
}

async function sendApprovalEmail({
  emails,
  taskTitle,
  owner,
  approvedBy,
}: {
  emails: string[]
  taskTitle: string
  owner: string
  approvedBy: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.APPROVAL_EMAIL_FROM

  if (!apiKey || !from || emails.length === 0) return

  const subject = `Task approved: ${taskTitle}`
  const text = [
    `The task "${taskTitle}" has been approved.`,
    `Owner: ${owner}`,
    `Approved by: ${approvedBy}`,
  ].join('\n')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: emails,
      subject,
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}.`)
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const supabase = makeSupabase(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { status?: TaskStatus }
  const nextStatus = body.status

  if (!nextStatus || !['Draft', 'Under Review', 'Approved'].includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const resolvedParams = await Promise.resolve(context.params)
  const { id } = resolvedParams
  if (!id) {
    return NextResponse.json({ error: 'Missing task id.' }, { status: 400 })
  }

  const admin = getAdminClient()

  const { data: actingProfile } = await admin
    .from('profiles')
    .select('id, name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!actingProfile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 403 })
  }

  if (
    nextStatus === 'Approved' &&
    actingProfile.role !== 'Master' &&
    actingProfile.role !== 'Approver'
  ) {
    return NextResponse.json({ error: 'Only Approvers and Masters can approve tasks.' }, { status: 403 })
  }

  const { data: task, error: taskError } = await admin
    .from(tasksTable)
    .update({ status: nextStatus })
    .eq('id', id)
    .select('id, title, owner, status')
    .single()

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 })
  }

  if (nextStatus === 'Approved') {
    const { data: profiles } = await admin
      .from('profiles')
      .select('email')
      .not('email', 'is', null)

    const emails = Array.from(
      new Set(
        (profiles ?? [])
          .map((profile) => profile.email?.trim())
          .filter((email): email is string => Boolean(email))
      )
    )

    try {
      await sendApprovalEmail({
        emails,
        taskTitle: task.title ?? `Task ${id}`,
        owner: task.owner ?? 'Unknown',
        approvedBy: actingProfile.name ?? user.email ?? 'Unknown approver',
      })
    } catch (error) {
      console.error('Approval email failed:', error)
    }
  }

  return NextResponse.json({ data: task })
}
