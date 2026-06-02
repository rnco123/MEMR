/**
 * Upload preset staff avatars to Supabase Storage bucket `staff-avatars`.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: npm run seed:avatars
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const BUCKET = 'staff-avatars'
const AVATARS = [
  'hw-male-doctor',
  'hw-male-nurse',
  'hw-male-medic',
  'hw-female-doctor',
  'hw-female-nurse',
  'hw-female-surgeon',
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const publicDir = path.join(__dirname, '..', 'public', 'avatars')

  for (const id of AVATARS) {
    const fileName = `${id}.svg`
    const localPath = path.join(publicDir, fileName)
    if (!fs.existsSync(localPath)) {
      console.warn(`Skip missing: ${localPath}`)
      continue
    }
    const body = fs.readFileSync(localPath)
    const storagePath = `presets/${fileName}`

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
      contentType: 'image/svg+xml',
      upsert: true,
    })

    if (error) {
      console.error(`Failed ${storagePath}:`, error.message)
      process.exitCode = 1
    } else {
      const publicUrl = `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${storagePath}`
      console.log(`OK ${storagePath} -> ${publicUrl}`)
    }
  }

  console.log('Done. Users can select these avatars in Profile settings.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
