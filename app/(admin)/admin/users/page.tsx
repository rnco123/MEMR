'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type FormEvent } from 'react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/UserAvatar'
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter'
import { LocationAssignmentChecklist } from '@/components/LocationAssignmentChecklist'
import { useT } from '@/lib/i18n'
import {
  ADMIN_STAFF_ROLE_VALUES,
  getRoleI18nKey,
  isPhysicianRole,
  type AdminStaffRoleValue,
} from '@/lib/roles'

interface Location {
  id: number
  title: string
  address?: string | null
  location_code?: string | null
}

interface StaffUser {
  uid: string
  role: string
  full_name: string | null
  email: string | null
  active: boolean
  created_at: string
  avatar_id?: string | null
  avatar_url?: string | null
  assigned_locations?: Location[]
  npi?: string | null
  compliance_access?: boolean
}

const PAGE_SIZE = 20
const INPUT_CLASS =
  'w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500'

const ROLE_OPTIONS = [
  { value: 'doctor' as const, labelKey: 'admin.role_doctor' },
  { value: 'fnp' as const, labelKey: 'admin.role_fnp' },
  { value: 'pa' as const, labelKey: 'admin.role_pa' },
  { value: 'nurse' as const, labelKey: 'admin.role_nurse' },
]

const ROLE_COLORS: Record<string, string> = {
  doctor: 'bg-blue-50 text-blue-700',
  fnp: 'bg-blue-50 text-blue-700',
  pa: 'bg-blue-50 text-blue-700',
  nurse: 'bg-green-50 text-green-700',
}

function isAdminStaffRoleValue(role: string): role is AdminStaffRoleValue {
  return (ADMIN_STAFF_ROLE_VALUES as readonly string[]).includes(role)
}

function userLabel(u: StaffUser) {
  return u.full_name || u.email || u.uid
}

function apiErrorMessage(data: { message?: string; error?: string }, fallback: string) {
  return data.message || data.error || fallback
}

function LocationCell({ assigned, t }: { assigned: Location[]; t: (key: string) => string }) {
  if (assigned.length === 0) {
    return <span className="text-slate-400">{t('common.em_dash')}</span>
  }
  if (assigned.length > 1) {
    const allTitles = assigned.map((l) => l.title).join(', ')
    return (
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100"
        title={allTitles}
      >
        {t('admin.users.multiple_locations')}
      </span>
    )
  }
  const only = assigned[0]!
  return (
    <span className="text-xs text-slate-600 truncate block" title={only.title}>
      {only.title}
    </span>
  )
}

const BTN =
  'px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors disabled:opacity-40 whitespace-nowrap'

function UserRow({
  user,
  deletingUid,
  onEdit,
  onResetPassword,
  onChangeLocations,
  onDelete,
  t,
}: {
  user: StaffUser
  deletingUid: string | null
  onEdit: (user: StaffUser) => void
  onResetPassword: (user: StaffUser) => void
  onChangeLocations: (user: StaffUser) => void
  onDelete: (user: StaffUser) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const assigned = user.assigned_locations ?? []
  const displayName = user.full_name || t('common.em_dash')

  return (
    <div
      className={`grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors ${!user.active ? 'opacity-60' : ''}`}
    >
      <div className="col-span-2 flex items-center gap-3 min-w-0">
        <UserAvatar
          name={displayName}
          avatarId={user.avatar_id}
          avatarUrl={user.avatar_url}
          size="sm"
          ringClassName="ring-1 ring-slate-200"
          className={!user.avatar_url && !user.avatar_id ? 'bg-slate-400' : ''}
        />
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-900 truncate block">{displayName}</span>
          {!user.active ? (
            <span className="text-[10px] font-semibold text-rose-600 uppercase">{t('admin.users.inactive')}</span>
          ) : user.role === 'staff' ? (
            <span className="text-[10px] font-semibold text-amber-600">{t('admin.users.needs_role_fix')}</span>
          ) : null}
        </div>
      </div>
      <div className="col-span-2 text-sm text-slate-500 truncate">{user.email || t('common.em_dash')}</div>
      <div className="col-span-2">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role] ?? 'bg-slate-50 text-slate-600'}`}
        >
          {t(getRoleI18nKey(user.role))}
        </span>
      </div>
      <div className="col-span-2 min-w-0">
        <LocationCell assigned={assigned} t={t} />
      </div>
      <div className="col-span-4 flex flex-wrap gap-1 justify-end">
        <button
          type="button"
          onClick={() => onEdit(user)}
          className={`${BTN} border-slate-200 text-slate-700 bg-white hover:bg-slate-50`}
        >
          {t('admin.users.edit')}
        </button>
        <button
          type="button"
          onClick={() => onResetPassword(user)}
          className={`${BTN} border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100`}
        >
          {t('admin.users.reset_password')}
        </button>
        <button
          type="button"
          onClick={() => onChangeLocations(user)}
          className={`${BTN} border-purple-200 text-purple-800 bg-purple-50 hover:bg-purple-100`}
        >
          {t('admin.users.change_locations')}
        </button>
        <button
          type="button"
          disabled={deletingUid === user.uid}
          onClick={() => onDelete(user)}
          className={`${BTN} border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100`}
        >
          {deletingUid === user.uid ? t('admin.users.deleting') : t('admin.users.delete')}
        </button>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const { t } = useT()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<AdminStaffRoleValue>('doctor')
  const [selectedLocations, setSelectedLocations] = useState<number[]>([])
  const [complianceAccess, setComplianceAccess] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deletingUid, setDeletingUid] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<StaffUser | null>(null)
  const [resetUser, setResetUser] = useState<StaffUser | null>(null)
  const [locationsUser, setLocationsUser] = useState<StaffUser | null>(null)
  const [modalSubmitting, setModalSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState<AdminStaffRoleValue>('doctor')
  const [editActive, setEditActive] = useState(true)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [editLocationIds, setEditLocationIds] = useState<number[]>([])
  const [editNpi, setEditNpi] = useState('')
  const [editComplianceAccess, setEditComplianceAccess] = useState(false)

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) throw new Error(apiErrorMessage(data, t('admin.users.load_failed')))
      setUsers(data.users ?? [])
      setLocations(data.locations ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.users.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [search, roleFilter, showInactive])

  const patchUser = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(apiErrorMessage(data, t('admin.users.update_failed')))
  }

  const openEdit = (u: StaffUser) => {
    setModalError(null)
    setEditUser(u)
    setEditName(u.full_name ?? '')
    setEditEmail(u.email ?? '')
    setEditRole(isAdminStaffRoleValue(u.role) ? u.role : 'doctor')
    setEditActive(u.active)
    setEditNpi(u.npi ?? '')
    setEditComplianceAccess(u.compliance_access === true)
  }

  const openResetPassword = (u: StaffUser) => {
    setModalError(null)
    setResetUser(u)
    setResetPassword('')
    setShowResetPw(false)
  }

  const openChangeLocations = (u: StaffUser) => {
    setModalError(null)
    setLocationsUser(u)
    setEditLocationIds((u.assigned_locations ?? []).map((l) => l.id))
  }

  const handleEditSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!editUser) return
    setModalSubmitting(true)
    setModalError(null)
    try {
      await patchUser({
        uid: editUser.uid,
        full_name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
        active: editActive,
        ...(editRole === 'doctor' ? { compliance_access: editComplianceAccess } : { compliance_access: false }),
        ...(isPhysicianRole(editRole) ? { npi: editNpi.trim() || null } : {}),
      })
      toast.success(t('admin.users.updated', { name: userLabel(editUser) }))
      setEditUser(null)
      load()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('admin.users.update_failed'))
    } finally {
      setModalSubmitting(false)
    }
  }

  const handleResetPasswordSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!resetUser) return
    setModalSubmitting(true)
    setModalError(null)
    try {
      await patchUser({ uid: resetUser.uid, password: resetPassword })
      toast.success(t('admin.users.password_reset', { name: userLabel(resetUser) }))
      setResetUser(null)
      setResetPassword('')
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('admin.users.password_reset_failed'))
    } finally {
      setModalSubmitting(false)
    }
  }

  const handleLocationsSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!locationsUser) return
    setModalSubmitting(true)
    setModalError(null)
    try {
      await patchUser({ uid: locationsUser.uid, location_ids: editLocationIds })
      toast.success(t('admin.users.locations_updated', { name: userLabel(locationsUser) }))
      setLocationsUser(null)
      load()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('admin.users.locations_update_failed'))
    } finally {
      setModalSubmitting(false)
    }
  }

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setShowPw(false)
    setRole('doctor')
    setSelectedLocations([])
    setComplianceAccess(false)
    setFormError(null)
    setFormSuccess(null)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFormSuccess(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          location_ids: selectedLocations,
          compliance_access: role === 'doctor' ? complianceAccess : false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(apiErrorMessage(data, t('admin.users.create_failed')))
        return
      }
      setFormSuccess(t('admin.users.account_created', { name }))
      resetForm()
      load()
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => {
        setShowForm(false)
        setFormSuccess(null)
      }, 2000)
    } catch {
      setFormError(t('admin.users.network_error'))
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (!showInactive && !u.active) return false
      if (roleFilter && u.role !== roleFilter) return false
      if (q) {
        return (u.full_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [users, roleFilter, search, showInactive])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleSoftDelete = async (u: StaffUser) => {
    if (!window.confirm(t('admin.users.soft_delete_confirm', { name: userLabel(u) }))) return
    setDeletingUid(u.uid)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: u.uid }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(apiErrorMessage(data, t('admin.users.delete_failed')))
        return
      }
      toast.success(t('admin.users.soft_deleted', { name: userLabel(u) }))
      load()
    } catch {
      toast.error(t('admin.users.network_error'))
    } finally {
      setDeletingUid(null)
    }
  }

  const closeForm = () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    setShowForm(false)
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.users.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('admin.users.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true)
            resetForm()
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('admin.create_user')}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.users.create_modal')}</h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.full_name')}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={t('admin.users.placeholder_name')}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('admin.users.placeholder_email')}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.password')}</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder={t('admin.users.placeholder_password')}
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {password && <PasswordStrengthMeter password={password} t={t} className="mt-1.5" />}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.role')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`admin-create-user-role-${opt.value}`}
                      onClick={() => {
                        // Intentional regression for Playwright: selecting a role fails.
                        setFormError('Failed to select role')
                        throw new Error('Create user role selection failed')
                      }}
                      className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                        role === opt.value
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-purple-300'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.locations')}</label>
                <LocationAssignmentChecklist
                  locations={locations}
                  selectedIds={selectedLocations}
                  onChange={setSelectedLocations}
                  listClassName="max-h-56"
                />
              </div>

              {role === 'doctor' && (
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={complianceAccess}
                    onChange={(e) => setComplianceAccess(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-purple-600"
                  />
                  <span>
                    <span className="font-medium">{t('admin.users.compliance_access')}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{t('admin.users.compliance_access_hint')}</span>
                  </span>
                </label>
              )}

              {formError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {formSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 h-10 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-10 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
                >
                  {submitting ? t('admin.users.creating') : t('admin.create_user')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.users.search')}
          className="flex-1 min-w-[180px] h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 border border-slate-200 rounded-lg px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        >
          <option value="">{t('admin.users.all_roles')}</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-purple-600"
          />
          {t('admin.users.show_inactive')}
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 bg-slate-100 rounded-full animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-100 rounded animate-pulse w-32" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <p className="text-slate-400 text-sm">{t('admin.users.no_accounts')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-2">{t('common.name')}</div>
              <div className="col-span-2">{t('common.email')}</div>
              <div className="col-span-2">{t('admin.users.role')}</div>
              <div className="col-span-2">{t('admin.users.locations')}</div>
              <div className="col-span-4 text-right">{t('common.actions')}</div>
            </div>
            {paginated.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                deletingUid={deletingUid}
                onEdit={openEdit}
                onResetPassword={openResetPassword}
                onChangeLocations={openChangeLocations}
                onDelete={handleSoftDelete}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {editUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.users.edit_modal')}</h2>
              <button type="button" onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.full_name')}</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} required className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('common.email')}</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.role')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setEditRole(opt.value)
                        if (opt.value !== 'doctor') setEditComplianceAccess(false)
                      }}
                      className={`py-2 rounded-lg border text-sm font-medium ${
                        editRole === opt.value
                          ? 'bg-purple-600 border-purple-600 text-white'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              {isPhysicianRole(editRole) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('admin.users.npi')}
                    <span className="font-normal text-slate-400 ml-1">({t('common.optional')})</span>
                  </label>
                  <input
                    value={editNpi}
                    onChange={(e) => setEditNpi(e.target.value)}
                    placeholder={t('profile.npi_placeholder')}
                    className={INPUT_CLASS}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <p className="text-xs text-slate-500 mt-1">{t('profile.npi_hint')}</p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="w-4 h-4 accent-purple-600" />
                {t('admin.users.active_account')}
              </label>
              {editRole === 'doctor' && (
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editComplianceAccess}
                    onChange={(e) => setEditComplianceAccess(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-purple-600"
                  />
                  <span>
                    <span className="font-medium">{t('admin.users.compliance_access')}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{t('admin.users.compliance_access_hint')}</span>
                  </span>
                </label>
              )}
              {modalError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditUser(null)} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex-1 h-10 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {modalSubmitting ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.users.reset_modal')}</h2>
              <button type="button" onClick={() => setResetUser(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleResetPasswordSave} className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                {t('admin.users.set_password_for', { name: userLabel(resetUser) })}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.users.new_password')}</label>
                <div className="relative">
                  <input
                    type={showResetPw ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    className={`${INPUT_CLASS} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPw((v) => !v)}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    {showResetPw ? t('admin.users.hide') : t('admin.users.show')}
                  </button>
                </div>
                {resetPassword && <PasswordStrengthMeter password={resetPassword} t={t} className="mt-1.5" />}
              </div>
              {modalError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setResetUser(null)} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex-1 h-10 bg-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {modalSubmitting ? t('common.saving') : t('admin.users.reset_password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {locationsUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.users.change_locations_modal')}</h2>
              <button type="button" onClick={() => setLocationsUser(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleLocationsSave} className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                {t('admin.users.assign_clinics_for', { name: userLabel(locationsUser) })}{' '}
                {t('admin.users.multiple_hint')}
              </p>
              <LocationAssignmentChecklist
                locations={locations}
                selectedIds={editLocationIds}
                onChange={setEditLocationIds}
                listClassName="max-h-72"
              />
              {modalError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{modalError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setLocationsUser(null)} className="flex-1 h-10 border border-slate-200 rounded-xl text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex-1 h-10 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {modalSubmitting ? t('common.saving') : t('admin.users.save_locations')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">
            {t('admin.users.showing', {
              start: (page - 1) * PAGE_SIZE + 1,
              end: Math.min(page * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              {t('common.previous')}
            </button>
            <span className="px-3 py-1.5 text-slate-600">
              {t('admin.users.page', { page, total: totalPages })}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
