import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAdminClient } from '../../lib/supabase-admin'

const taskFilesTable = process.env.NEXT_PUBLIC_SUPABASE_TASK_FILES_TABLE ?? 'task_files'
const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'Document'

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

async function getUser(request: NextRequest) {
  try {
    const { data: { user } } = await makeSupabase(request).auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await getUser(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { task_id, file_name, version, file_path, file_url, uploaded_at } = await request.json()
    if (!task_id || !file_name || !file_path || !file_url)
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })

    const admin = getAdminClient()
    const { data, error } = await admin.from(taskFilesTable).insert({
      task_id, file_name, version: version ?? 'v1.0', file_path, file_url,
      uploaded_at: uploaded_at ?? new Date().toISOString(),
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await getUser(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { file_id, file_path, permanent } = await request.json()
    if (!file_id) return NextResponse.json({ error: 'Missing file_id.' }, { status: 400 })

    const admin = getAdminClient()

    if (permanent) {
      if (file_path) await admin.storage.from(storageBucket).remove([file_path])
      const { error } = await admin.from(taskFilesTable).delete().eq('id', file_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin.from(taskFilesTable)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', file_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!await getUser(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { file_id } = await request.json()
    if (!file_id) return NextResponse.json({ error: 'Missing file_id.' }, { status: 400 })

    const admin = getAdminClient()
    const { error } = await admin.from(taskFilesTable)
      .update({ deleted_at: null })
      .eq('id', file_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
