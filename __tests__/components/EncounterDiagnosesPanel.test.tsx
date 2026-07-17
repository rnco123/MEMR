import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EncounterDiagnosesPanel } from '@/components/EncounterDiagnosesPanel'

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/i18n', () => {
  const labels: Record<string, string> = {
    'common.save': 'Save',
    'encounter_diagnoses.search_label': 'Search diagnoses',
    'encounter_diagnoses.pending': 'Pending diagnoses',
  }
  const t = (key: string) => labels[key] ?? key
  return { useT: () => ({ t }) }
})

const diagnosis = {
  id: 42,
  icd_code: 'E11.9',
  description: 'Type 2 diabetes mellitus without complications',
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response
}

describe('EncounterDiagnosesPanel pending workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/diagnoses?q=')) {
        return jsonResponse({ diagnoses: [diagnosis] })
      }
      if (url.endsWith('/api/encounters/7/diagnoses') && init?.method === 'POST') {
        return jsonResponse({
          data: [
            {
              id: 99,
              encounter_id: 7,
              diagnosis_id: diagnosis.id,
              created_at: '2026-07-17T00:00:00Z',
              updated_at: '2026-07-17T00:00:00Z',
              diagnosis,
            },
          ],
        })
      }
      return jsonResponse({ diagnoses: [] })
    }) as jest.Mock
  })

  it('does not persist a manual selection until Save is clicked', async () => {
    render(<EncounterDiagnosesPanel encounterId={7} canEdit aiSuggestions={[]} />)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/encounters/7/diagnoses',
        expect.objectContaining({ credentials: 'include' })
      )
    )

    fireEvent.change(screen.getByLabelText('Search diagnoses'), {
      target: { value: 'diabetes' },
    })
    const result = await screen.findByText(diagnosis.description)
    fireEvent.click(result.closest('button')!)

    expect(screen.getByText('Pending diagnoses')).toBeTruthy()
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/api/encounters/7/diagnoses') && init?.method === 'POST'
      )
    ).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/encounters/7/diagnoses',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ diagnosis_ids: [42] }),
        })
      )
    )
  })
})
