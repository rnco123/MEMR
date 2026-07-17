import type { ExamData, RosData } from '@/lib/encounter/physical-examination'

export type FindingOption = {
  /** Stable identifier used to persist the selection (the finding label itself). */
  label: string
}

/** Split a comma-separated findings hint into individual clickable options. */
export function toFindingOptions(notes: string): FindingOption[] {
  return notes
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(label => ({ label }))
}

export type RosRowDef = {
  key: keyof Pick<
    RosData,
    | 'cons'
    | 'skin'
    | 'eyes'
    | 'ears'
    | 'nose'
    | 'throat'
    | 'cv_resp'
    | 'gi'
    | 'gu'
    | 'gyn'
    | 'male'
    | 'ms'
    | 'neu'
    | 'psych'
    | 'hemat_lymph'
  >
  label: string
  notes: string
  findings: FindingOption[]
  extras?: Array<{ key: keyof RosData; placeholder: string }>
}

export type ExamRowDef = {
  key: keyof Pick<
    ExamData,
    | 'general'
    | 'skin'
    | 'head'
    | 'eyes'
    | 'ears'
    | 'nose'
    | 'throat'
    | 'neck'
    | 'cv'
    | 'respir'
    | 'abdomen'
    | 'gu'
    | 'rectal'
    | 'ms'
    | 'neuro'
  >
  label: string
  notes: string
  findings: FindingOption[]
  extras?: Array<{ key: keyof ExamData; placeholder: string }>
}

type RosRowSeed = Omit<RosRowDef, 'findings'>
type ExamRowSeed = Omit<ExamRowDef, 'findings'>

const withRosFindings = (row: RosRowSeed): RosRowDef => ({ ...row, findings: toFindingOptions(row.notes) })
const withExamFindings = (row: ExamRowSeed): ExamRowDef => ({ ...row, findings: toFindingOptions(row.notes) })

const ROS_ROW_SEEDS: RosRowSeed[] = [
  { key: 'cons', label: 'Cons:', notes: 'Chili, Muscle Aches, Poor Appetite/sleep, Weight Change, Weight Loss' },
  { key: 'skin', label: 'Skin:', notes: 'Rash, Lesions, Pallor, Hair loss, Jaundice, Itching' },
  { key: 'eyes', label: 'Eyes:', notes: 'Redness, Itchiness, Discharge, Visual changes' },
  { key: 'ears', label: 'Ears:', notes: 'Pain, Discharge, Pressure, Difficulty hearing' },
  { key: 'nose', label: 'Nose:', notes: 'Nose bleeds, Congestion, Sinus-Pressure, Postnasal Drip' },
  { key: 'throat', label: 'Throat:', notes: 'Soreness, Redness, Difficulty speaking/swallowing' },
  {
    key: 'cv_resp',
    label: 'CV/Resp:',
    notes: "Cough, Wheezing, SOB, Orthopnea, Hemoptysis, CP, DOE, Palpitations, Edema LE's, Sputum",
  },
  { key: 'gi', label: 'GI:', notes: 'Pain: RUQ-LUQ-RLQ-LLQ, Nausea, Vomiting, Diarrhea, Constipation, Hemorrhoids' },
  { key: 'gu', label: 'GU:', notes: 'Frequency, Urgency, Hesitancy, Nocturia, Hematuria, Dysuria' },
  {
    key: 'gyn',
    label: 'GYN:',
    notes: 'Dyspareunia, discharge, dysuria, bleeding, Irregular menses, missed menses, pregnant',
    extras: [{ key: 'gyn_lmp', placeholder: 'LMP date' }],
  },
  { key: 'male', label: 'Male:', notes: 'Penile Discharge, Erectile Dysfunction' },
  { key: 'ms', label: 'MS:', notes: 'Joint pain, swelling, Stiffness, Muscle Pain' },
  {
    key: 'neu',
    label: 'Neu:',
    notes: 'Headache, Dizziness, Weakness, Difficulty Walking',
    extras: [
      { key: 'neu_numbness', placeholder: 'Numbness' },
      { key: 'neu_tingling', placeholder: 'Tingling' },
    ],
  },
  { key: 'psych', label: 'Psych:', notes: 'Depressed Mood, Anxious Mood' },
  { key: 'hemat_lymph', label: 'Hemat/Lymph:', notes: 'Bruising, Fatigue, Anemia, Heat/Cold intolerance' },
]

export const ROS_ROWS: RosRowDef[] = ROS_ROW_SEEDS.map(withRosFindings)

const EXAM_ROW_SEEDS: ExamRowSeed[] = [
  { key: 'general', label: 'General:', notes: 'Lethargic, Cachectic, Obese, Uncomfortable, Pallor, Acute Distress, Appears Stated Age' },
  { key: 'skin', label: 'Skin:', notes: 'Warm, Dry, skin tone, Rash, Bruises, Lesions, Nails' },
  { key: 'head', label: 'Head:', notes: 'Normocephalic, Atraumatic' },
  { key: 'eyes', label: 'Eyes:', notes: 'PERRLA, EOMI, Conjunctiva, Sclera, Fundi, Redness, Discharge' },
  { key: 'ears', label: 'Ears:', notes: 'TM / Light reflex, Ext Auditory canals, Cerumen, TM red-bulging' },
  { key: 'nose', label: 'Nose:', notes: 'Mucosa w/o edema, septum at midline, sinus, Tenderness, Runny, Congestive, Bleeding' },
  { key: 'throat', label: 'Throat:', notes: 'Tonsil swelling/Erythema/Exudates, Oral lesion, Dentition/Gums, Pharynx swelling/Redness' },
  { key: 'neck', label: 'Neck:', notes: 'Supple, pain, Thyromegaly, Carotid Bruit' },
  { key: 'cv', label: 'CV:', notes: 'Regular Rate and Rhythm, S1, S2, Murmurs, Rubs, Gallops, Clicks, JVD, Peripheral Pulses' },
  { key: 'respir', label: 'Respir:', notes: 'Rales, Rhonchi, Wheezing, Chest wall tenderness' },
  { key: 'abdomen', label: 'Abdomen:', notes: 'Soft, Tenderness, Normoactive Bowel Sound, HSM, Rebound, Guarding, Masses' },
  { key: 'gu', label: 'GU: fem/Male:', notes: 'External genitalia Lesions, cervical lesions, Phallus, Urethral discharge, Masses' },
  { key: 'rectal', label: 'Rectal:', notes: 'Tone, Masses, Hemorrhoids, prostate Size' },
  {
    key: 'ms',
    label: 'MS:',
    notes: 'ROM, Tenderness, Swelling, distal pulses, Homans, SLR test',
    extras: [{ key: 'ms_sites', placeholder: 'Exam sites' }],
  },
  { key: 'neuro', label: 'Neuro:', notes: 'Affect, Alert/Orientedx3, Cranial Nerves 2-12, int Motor, Tone, Sensory, Reflex, Gait' },
]

export const EXAM_ROWS: ExamRowDef[] = EXAM_ROW_SEEDS.map(withExamFindings)
