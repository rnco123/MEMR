import { classifyQuantiferon } from '@/lib/i693/tb-analysis/qft-rules'

const v = (value: number | null, raw?: string) => ({ value, raw: raw ?? null })

describe('classifyQuantiferon — QFT-Plus interpretation criteria', () => {
  it('is Positive when TB1-Nil clears both the absolute and the 25%-of-Nil cut-off', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(0.5),
      tb2Nil: v(0.2),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Positive')
    expect(result.rule).toBe('antigen_above_cutoff')
  })

  it('is Positive when only TB2-Nil responds', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(0.2),
      tb2Nil: v(0.6),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Positive')
  })

  it('is Negative when neither antigen responds and Mitogen meets the control minimum', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(0.1),
      tb2Nil: v(0.1),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Negative')
  })

  it('is Indeterminate when Mitogen is below 0.5 and no antigen responds', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(0.1),
      tb2Nil: v(0.1),
      mitogenNil: v(0.2),
    })
    expect(result.classification).toBe('Indeterminate')
    expect(result.rule).toBe('mitogen_below_cutoff')
  })

  it('is Indeterminate when Nil exceeds 8.0 regardless of the antigen tubes', () => {
    const result = classifyQuantiferon({
      nil: v(9.0),
      tb1Nil: v(4.0),
      tb2Nil: v(4.0),
      mitogenNil: v(10.0),
    })
    expect(result.classification).toBe('Indeterminate')
    expect(result.rule).toBe('nil_above_maximum')
  })

  it('treats a censored Nil of ">8.0" as exceeding the maximum', () => {
    const result = classifyQuantiferon({
      nil: v(8.0, '>8.0'),
      tb1Nil: v(0.1),
      tb2Nil: v(0.1),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Indeterminate')
    expect(result.rule).toBe('nil_above_maximum')
  })

  it('requires the 25%-of-Nil criterion, not just the 0.35 absolute cut-off', () => {
    // 0.40 clears 0.35 but not 25% of a 2.0 Nil (= 0.50), so this is not Positive.
    const result = classifyQuantiferon({
      nil: v(2.0),
      tb1Nil: v(0.4),
      tb2Nil: v(0.1),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Negative')
  })

  it('returns Unable to Determine and names the gap when a value is missing', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(null),
      tb2Nil: v(0.1),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Unable to Determine')
    expect(result.confidence).toBe(0)
    expect(result.missing).toContain('TB1-Nil')
  })

  it('flags a borderline call when a deciding value sits on its cut-off', () => {
    const result = classifyQuantiferon({
      nil: v(0.1),
      tb1Nil: v(0.35),
      tb2Nil: v(0.1),
      mitogenNil: v(5.0),
    })
    expect(result.classification).toBe('Positive')
    expect(result.borderline).toBe(true)
  })

  it('matches the lab-stated result on a real report', () => {
    // Values as printed on a real QuantiFERON-TB Gold Plus panel whose lab
    // interpretation reads NEGATIVE.
    const result = classifyQuantiferon({
      nil: v(0.0472),
      tb1Nil: v(0.006),
      tb2Nil: v(0.03),
      mitogenNil: v(9.953),
    })
    expect(result.classification).toBe('Negative')
    expect(result.borderline).toBe(false)
  })

  it('scales confidence by the caller-supplied extraction confidence', () => {
    const input = {
      nil: v(0.1),
      tb1Nil: v(5.0),
      tb2Nil: v(5.0),
      mitogenNil: v(10.0),
    }
    const certain = classifyQuantiferon(input, 1)
    const unsure = classifyQuantiferon(input, 0.5)
    expect(certain.classification).toBe('Positive')
    expect(unsure.classification).toBe('Positive')
    expect(unsure.confidence).toBeLessThan(certain.confidence)
  })
})
