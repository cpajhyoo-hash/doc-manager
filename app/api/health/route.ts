import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const envOk = {
    NEXT_PUBLIC_SUPABASE_URL: !!url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!anonKey,
    SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
    supabaseUrlPrefix: url ? url.slice(0, 40) : 'MISSING',
  }

  let dbStatus = 'not tested'
  if (url && serviceKey) {
    try {
      const admin = createClient(url, serviceKey)
      const { error } = await admin.from('profiles').select('id').limit(1)
      dbStatus = error ? `error: ${error.message}` : 'ok'
    } catch (e) {
      dbStatus = `exception: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  return NextResponse.json({ env: envOk, db: dbStatus })
}
