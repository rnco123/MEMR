export const STRENGTH_UNITS = ['mg', 'mcg', 'g', 'mL', '%', 'units'] as const

export const RX_ROUTES = [
  'Oral (PO)',
  'Sublingual (SL)',
  'Buccal',
  'Topical',
  'Transdermal',
  'Inhalation',
  'Intranasal',
  'Ophthalmic',
  'Otic',
  'Rectal',
  'Vaginal',
  'Intramuscular (IM)',
  'Subcutaneous (SC)',
  'Intravenous (IV)',
  'Intra-articular',
] as const

export const RX_FREQUENCIES = [
  'Once daily (QD)',
  'Twice daily (BID)',
  'Three times daily (TID)',
  'Four times daily (QID)',
  'Every 4 hours (q4h)',
  'Every 6 hours (q6h)',
  'Every 8 hours (q8h)',
  'Every 12 hours (q12h)',
  'At bedtime (QHS)',
  'As needed (PRN)',
  'Once weekly',
] as const

export const DURATION_UNITS = ['days', 'weeks', 'months'] as const

export const QUANTITY_UNITS = [
  'tablets',
  'capsules',
  'mL',
  'g',
  'patches',
  'vials',
  'units',
  'suppositories',
] as const

/** Common medications for autocomplete (expand over time or wire to drug DB later). */
export const COMMON_MEDICATIONS = [
  'Acetaminophen',
  'Amoxicillin',
  'Azithromycin',
  'Albuterol inhaler',
  'Amlodipine',
  'Atorvastatin',
  'Cephalexin',
  'Ciprofloxacin',
  'Doxycycline',
  'Fluconazole',
  'Gabapentin',
  'Hydrochlorothiazide',
  'Ibuprofen',
  'Lisinopril',
  'Losartan',
  'Metformin',
  'Metoprolol',
  'Montelukast',
  'Omeprazole',
  'Ondansetron',
  'Prednisone',
  'Sertraline',
  'Sumatriptan',
  'Tramadol',
  'Vitamin D3',
] as const

export const MAX_REFILLS = 12
