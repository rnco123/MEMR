'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ImmigrationCaseRow } from '@/lib/immigration/types'

export function useImmigrationWorkflowCase(encounterId: number) {
  const [caseRow, setCaseRow] = useState<ImmigrationCaseRow | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/i693/cases/${encounterId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const json = await res.json()
      if (res.ok) {
        setCaseRow((json.data as ImmigrationCaseRow | null) ?? null)
      } else {
        setCaseRow(null)
      }
    } catch {
      setCaseRow(null)
    } finally {
      setLoading(false)
    }
  }, [encounterId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { caseRow, loading, reload }
}
