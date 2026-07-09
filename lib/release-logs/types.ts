export type ReleaseLogStatus = 'upcoming' | 'released'

export type ReleaseLogRow = {
  id: string
  task: string
  description: string | null
  status: ReleaseLogStatus
  sort_order: number
  created_by: string | null
  created_by_name: string | null
  released_at: string | null
  created_at: string
  updated_at: string
}
