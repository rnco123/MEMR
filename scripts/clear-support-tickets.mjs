import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or service role key')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BUCKET = 'support-attachments'

async function listAllFiles(prefix = '') {
  const { data: items, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  if (!items?.length) return []

  const paths = []
  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id) paths.push(path)
    else paths.push(...(await listAllFiles(path)))
  }
  return paths
}

async function main() {
  const { data: attachments, error: attErr } = await admin
    .from('support_ticket_attachments')
    .select('file_path')
  if (attErr) throw attErr

  const dbPaths = [...new Set((attachments ?? []).map((a) => a.file_path).filter(Boolean))]
  const listedPaths = await listAllFiles()
  const allPaths = [...new Set([...dbPaths, ...listedPaths])]

  if (allPaths.length > 0) {
    const { error: removeErr } = await admin.storage.from(BUCKET).remove(allPaths)
    if (removeErr) throw removeErr
    console.log(`Removed ${allPaths.length} storage file(s)`)
  } else {
    console.log('No storage files to remove')
  }

  const { error: deleteErr } = await admin
    .from('support_tickets')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteErr) throw deleteErr

  const [{ count: tickets }, { count: messages }, { count: atts }] = await Promise.all([
    admin.from('support_tickets').select('*', { count: 'exact', head: true }),
    admin.from('support_ticket_messages').select('*', { count: 'exact', head: true }),
    admin.from('support_ticket_attachments').select('*', { count: 'exact', head: true }),
  ])

  console.log('Remaining:', { tickets, messages, attachments: atts })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
