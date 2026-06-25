import type { ComplianceDatePreset } from './date-presets'
import type { PhysicianReviewStatus } from './physician-review'

export type ComplianceProviderSummary = {
  id: string
  name: string
  role: string
  clinic: string
  total: number
  required: number
  reviewed: number
  pending: number
  overdue: number
  compliance: number
  avatar: string
}

export type CompliancePendingReview = {
  id: string
  reviewId: number
  encounterId: string
  encounterIdNum: number
  patientIdNum: number
  patient: string
  patientId: string
  provider: string
  clinic: string
  encounterDate: string
  daysPending: number
  status: 'pending' | 'overdue' | 'in_review'
  riskScore: number
  dob: string
  chiefComplaint: string
  soap: { subjective: string; objective: string; assessment: string; plan: string }
  diagnoses: string[]
  medications: string[]
  orders: string[]
}

export type ComplianceTrendPoint = {
  date: string
  reviewed: number
  required: number
  compliance: number
}

export type ComplianceVelocityPoint = {
  week: string
  reviews: number
}

export type ComplianceDashboardResponse = {
  kpi: {
    total: number
    required: number
    reviewed: number
    remaining: number
    compliance: number
    pending: number
    overdue: number
  }
  providers: ComplianceProviderSummary[]
  pending: CompliancePendingReview[]
  trend: ComplianceTrendPoint[]
  velocity: ComplianceVelocityPoint[]
  filterOptions: {
    providers: string[]
    clinics: string[]
  }
  sparklines: {
    total: number[]
    required: number[]
    reviewed: number[]
    remaining: number[]
    compliance: number[]
    overdue: number[]
  }
}

export type ComplianceQueryParams = {
  preset: ComplianceDatePreset
  provider?: string | null
  clinic?: string | null
  status?: 'all' | 'compliant' | 'warning' | 'critical'
}

export type ComplianceReviewDetail = {
  reviewId: number
  encounterId: number
  encounterCode: string | null
  reviewStatus: PhysicianReviewStatus
  notes: string | null
  findings: string | null
  patient: {
    name: string
    patientCode: string | null
    dob: string | null
    chiefComplaint: string | null
  }
  provider: string
  clinic: string
  encounterDate: string
  soap: {
    subjective: string
    objective: string
    assessment: string
    plan: string
  }
}
