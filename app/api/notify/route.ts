import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { Resend } from 'resend'
import { getAdminClient } from '../../lib/supabase-admin'

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskTitle, taskOwner, approverName } = await request.json()
  if (!taskTitle) return NextResponse.json({ error: 'Missing taskTitle.' }, { status: 400 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !apiKey.startsWith('re_')) {
    return NextResponse.json({ warning: 'RESEND_API_KEY not configured — email skipped.' })
  }

  const admin = getAdminClient()
  const { data: profiles } = await admin.from('profiles').select('email, name')
  const recipients = (profiles ?? []).map((p: { email: string }) => p.email).filter(Boolean)

  if (recipients.length === 0) {
    return NextResponse.json({ warning: 'No recipients found.' })
  }

  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from: 'Doc Manager <onboarding@resend.dev>',
    to: recipients,
    subject: `Task Approved: ${taskTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0f172a;">Task Approved</h2>
        <p style="color:#475569;">The following task has been approved:</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
          <p style="margin:0;font-size:18px;font-weight:600;color:#0f172a;">${taskTitle}</p>
          <p style="margin:8px 0 0;color:#64748b;">Owner: ${taskOwner ?? 'Unknown'}</p>
        </div>
        <p style="color:#64748b;">Approved by <strong>${approverName ?? 'an approver'}</strong>.</p>
      </div>
    `,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, sent: recipients.length })
}
