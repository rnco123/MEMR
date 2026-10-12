import { z } from 'zod'

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

export type SignupRequestRow = {
  id: string
  user_id: string | null
  status: SignupRequestStatus
  contact_name: string
  email: string
  tenant_name: string
  location_name: string
  location_address: string
  location_phone: string
  location_email: string
  tenant_id: number | null
  location_id: number | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

/**
 * The fields the signup form collects and an admin may edit before approving.
 * There is no role: the point of contact always becomes the tenant's clinic manager.
 */
export const signupRequestFieldsSchema = z.object({
  contact_name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  tenant_name: z.string().trim().min(2).max(200),
  location_name: z.string().trim().min(2).max(200),
  location_address: z.string().trim().min(5).max(1000),
  location_phone: z.string().trim().min(7).max(50),
  location_email: z.string().trim().toLowerCase().email(),
})

export type SignupRequestFields = z.infer<typeof signupRequestFieldsSchema>

/** Same password rule as admin-created users (app/api/admin/users). */
export const signupPasswordSchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/[A-Z]/, 'Must have uppercase')
  .regex(/[a-z]/, 'Must have lowercase')
  .regex(/[0-9]/, 'Must have number')
  .regex(/[^A-Za-z0-9]/, 'Must have special char')

export const signupRequestCreateSchema = signupRequestFieldsSchema.extend({
  password: signupPasswordSchema,
  turnstileToken: z.string().nullable().optional(),
})

export const signupRequestEditSchema = signupRequestFieldsSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' })

export const signupRequestRejectSchema = z.object({
  note: z.string().trim().max(2000).optional(),
})
