/** Inline copy of resolveSoapPayload logic for unit testing without DB. */
function resolveSoapPayload(
  doctorSoap: Record<string, unknown> | null,
  aiSoap: Record<string, unknown> | null
) {
  if (doctorSoap) {
    return {
      subjective_text: String(doctorSoap.subjective_text ?? '').trim(),
      objective_text: String(doctorSoap.objective_text ?? '').trim(),
      assessment_text: String(doctorSoap.assessment_text ?? '').trim(),
      plan_text: String(doctorSoap.plan_text ?? '').trim(),
    }
  }
  if (aiSoap) {
    return {
      subjective_text: String(aiSoap.subjective_text ?? '').trim(),
      objective_text: String(aiSoap.objective_text ?? '').trim(),
      assessment_text: String(aiSoap.assessment_text ?? '').trim(),
      plan_text: String(aiSoap.plan_text ?? '').trim(),
    }
  }
  throw new Error('No SOAP notes available to email')
}

describe('SOAP email payload resolution', () => {
  it('prefers saved doctor SOAP over AI', () => {
    const soap = resolveSoapPayload(
      { subjective_text: 'Doctor note', objective_text: 'O', assessment_text: 'A', plan_text: 'P' },
      { subjective_text: 'AI note', objective_text: 'O', assessment_text: 'A', plan_text: 'P' }
    )
    expect(soap.subjective_text).toBe('Doctor note')
  })

  it('falls back to AI when no doctor SOAP row', () => {
    const soap = resolveSoapPayload(null, {
      subjective_text: 'AI note',
      objective_text: 'O',
      assessment_text: 'A',
      plan_text: 'P',
    })
    expect(soap.subjective_text).toBe('AI note')
  })

  it('throws when neither doctor nor AI SOAP exists', () => {
    expect(() => resolveSoapPayload(null, null)).toThrow('No SOAP notes available to email')
  })
})
