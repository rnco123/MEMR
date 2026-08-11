/**
 * QuantiFERON-TB Gold Plus (QFT-Plus) result interpretation.
 *
 * The cut-offs below are the manufacturer/CDC interpretation criteria and are applied
 * deterministically — the model extracts the numbers, this module decides the result, so
 * a classification never depends on model judgement.
 *
 * All values are interferon-gamma concentrations in IU/mL. TB1/TB2/Mitogen values are
 * nil-subtracted.
 */

/** Nil above this makes the whole assay uninterpretable. */
const NIL_MAX = 8.0
/** TB antigen response must clear this absolute cut-off. */
const ANTIGEN_CUTOFF = 0.35
/** …and also this fraction of the Nil value. */
const ANTIGEN_NIL_FRACTION = 0.25
/** Mitogen (positive control) must clear this for a Negative to be valid. */
const MITOGEN_CUTOFF = 0.5

export type QftClassification =
  | 'Positive'
  | 'Negative'
  | 'Indeterminate'
  | 'Unable to Determine'

/** A value as printed on the report: numeric plus the raw string, which may be censored (">10.0"). */
export type ReportedValue = {
  value: number | null
  raw?: string | null
}

export type QftInput = {
  nil: ReportedValue
  tb1Nil: ReportedValue
  tb2Nil: ReportedValue
  mitogenNil: ReportedValue
}

export type QftClassificationResult = {
  classification: QftClassification
  /** 0–1. Combines distance from the deciding cut-off with the caller's extraction confidence. */
  confidence: number
  /** True when a deciding value sits within 10% of its cut-off — re-read the source report. */
  borderline: boolean
  /** The interpretation criterion that produced the classification. */
  rule: string
  reasons: string[]
  /** Field labels that were required but missing or unreadable. */
  missing: string[]
}

type Resolved = {
  value: number
  raw: string | null
  /** Report printed a lower bound, e.g. ">10.0" — true value is at least `value`. */
  atLeast: boolean
  /** Report printed an upper bound, e.g. "<0.05" — true value is at most `value`. */
  atMost: boolean
}

function resolve(reported: ReportedValue | undefined): Resolved | null {
  if (!reported || reported.value == null || !Number.isFinite(reported.value)) return null
  const raw = (reported.raw ?? '').trim()
  return {
    value: reported.value,
    raw: raw || null,
    atLeast: raw.startsWith('>') || raw.startsWith('≥'),
    atMost: raw.startsWith('<') || raw.startsWith('≤'),
  }
}

/** Relative distance from a cut-off, clamped to 0–1. Used to grade how borderline a call is. */
function margin(value: number, cutoff: number): number {
  if (cutoff <= 0) return 1
  return Math.min(1, Math.abs(value - cutoff) / cutoff)
}

function antigenPositive(antigen: Resolved, nil: Resolved): boolean {
  return antigen.value >= ANTIGEN_CUTOFF && antigen.value >= ANTIGEN_NIL_FRACTION * nil.value
}

function gradeConfidence(margins: number[], extractionConfidence: number): {
  confidence: number
  borderline: boolean
} {
  const tightest = margins.length > 0 ? Math.min(...margins) : 1
  const ruleConfidence = 0.7 + 0.3 * tightest
  const extraction = Number.isFinite(extractionConfidence)
    ? Math.min(1, Math.max(0, extractionConfidence))
    : 0.5
  return {
    confidence: Math.round(ruleConfidence * extraction * 100) / 100,
    borderline: tightest < 0.1,
  }
}

/**
 * Apply the QFT-Plus interpretation criteria.
 *
 * `extractionConfidence` is how sure the caller is that the four values were read correctly;
 * it scales the returned confidence but never changes the classification.
 */
export function classifyQuantiferon(
  input: QftInput,
  extractionConfidence = 1
): QftClassificationResult {
  const nil = resolve(input.nil)
  const tb1 = resolve(input.tb1Nil)
  const tb2 = resolve(input.tb2Nil)
  const mitogen = resolve(input.mitogenNil)

  const missing: string[] = []
  if (!nil) missing.push('Nil')
  if (!tb1) missing.push('TB1-Nil')
  if (!tb2) missing.push('TB2-Nil')
  if (!mitogen) missing.push('Mitogen-Nil')

  if (!nil || !tb1 || !tb2 || !mitogen) {
    return {
      classification: 'Unable to Determine',
      confidence: 0,
      borderline: false,
      rule: 'incomplete_values',
      reasons: [`Missing required value(s): ${missing.join(', ')}.`],
      missing,
    }
  }

  // Nil > 8.0 invalidates the assay regardless of the antigen tubes.
  const nilExceedsMax = nil.value > NIL_MAX || (nil.atLeast && nil.value >= NIL_MAX)
  if (nilExceedsMax) {
    const graded = gradeConfidence([margin(nil.value, NIL_MAX)], extractionConfidence)
    return {
      classification: 'Indeterminate',
      confidence: graded.confidence,
      borderline: graded.borderline,
      rule: 'nil_above_maximum',
      reasons: [`Nil ${nil.raw ?? nil.value} IU/mL exceeds the ${NIL_MAX} IU/mL maximum.`],
      missing,
    }
  }

  const tb1Positive = antigenPositive(tb1, nil)
  const tb2Positive = antigenPositive(tb2, nil)

  if (tb1Positive || tb2Positive) {
    const deciding = [
      ...(tb1Positive ? [tb1] : []),
      ...(tb2Positive ? [tb2] : []),
    ]
    const margins = deciding.flatMap((antigen) => [
      margin(antigen.value, ANTIGEN_CUTOFF),
      margin(antigen.value, ANTIGEN_NIL_FRACTION * nil.value),
    ])
    const graded = gradeConfidence(margins, extractionConfidence)
    const which = [tb1Positive ? 'TB1-Nil' : null, tb2Positive ? 'TB2-Nil' : null]
      .filter(Boolean)
      .join(' and ')
    return {
      classification: 'Positive',
      confidence: graded.confidence,
      borderline: graded.borderline,
      rule: 'antigen_above_cutoff',
      reasons: [
        `${which} is at or above ${ANTIGEN_CUTOFF} IU/mL and at or above ${
          ANTIGEN_NIL_FRACTION * 100
        }% of Nil (${nil.value} IU/mL).`,
      ],
      missing,
    }
  }

  // Neither antigen tube responded — the Mitogen control decides Negative vs Indeterminate.
  const mitogenValid = mitogen.value >= MITOGEN_CUTOFF || (mitogen.atLeast && mitogen.value >= MITOGEN_CUTOFF)
  const graded = gradeConfidence(
    [
      margin(mitogen.value, MITOGEN_CUTOFF),
      margin(Math.max(tb1.value, tb2.value), ANTIGEN_CUTOFF),
    ],
    extractionConfidence
  )

  if (mitogenValid) {
    return {
      classification: 'Negative',
      confidence: graded.confidence,
      borderline: graded.borderline,
      rule: 'antigens_below_cutoff_mitogen_valid',
      reasons: [
        `TB1-Nil (${tb1.value}) and TB2-Nil (${tb2.value}) are below ${ANTIGEN_CUTOFF} IU/mL or below ${
          ANTIGEN_NIL_FRACTION * 100
        }% of Nil.`,
        `Mitogen-Nil ${mitogen.raw ?? mitogen.value} IU/mL meets the ${MITOGEN_CUTOFF} IU/mL control minimum.`,
      ],
      missing,
    }
  }

  return {
    classification: 'Indeterminate',
    confidence: graded.confidence,
    borderline: graded.borderline,
    rule: 'mitogen_below_cutoff',
    reasons: [
      `TB1-Nil (${tb1.value}) and TB2-Nil (${tb2.value}) are below the antigen cut-off.`,
      `Mitogen-Nil ${mitogen.raw ?? mitogen.value} IU/mL is below the ${MITOGEN_CUTOFF} IU/mL control minimum, so a Negative cannot be confirmed.`,
    ],
    missing,
  }
}
