'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { useCallback, useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type Pharmacy = {
  id: number
  name: string | null
  address: string | null
  phone: string | null
  email: string | null
  active_key_count: number
  total_key_count: number
  created_at: string
  updated_at: string
}

type ApiKey = {
  id: number
  key_name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

type RevealedKey = {
  pharmacyId: number
  rawKey: string
  keyName: string
}

const blankPharmacyForm = { name: '', address: '', phone: '', email: '' }
const blankKeyForm = { key_name: '', expires_at: '' }

function PharmaciesPage() {
  const { t, language } = useT()
  const locale = language === 'es' ? 'es-ES' : 'en-US'

  const [rows, setRows] = useState<Pharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [createForm, setCreateForm] = useState(blankPharmacyForm)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(blankPharmacyForm)
  const [editSaving, setEditSaving] = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [keysByPharmacy, setKeysByPharmacy] = useState<Record<number, ApiKey[]>>({})
  const [keysLoading, setKeysLoading] = useState<number | null>(null)

  const [keyForms, setKeyForms] = useState<Record<number, typeof blankKeyForm>>({})
  const [mintingId, setMintingId] = useState<number | null>(null)
  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null)

  const loadPharmacies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pharmacies', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_load_failed'))
      setRows(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadPharmacies()
  }, [loadPharmacies])

  const loadKeys = useCallback(async (pharmacyId: number) => {
    setKeysLoading(pharmacyId)
    try {
      const res = await fetch(`/api/pharmacies/${pharmacyId}/api-keys`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_keys_load_failed'))
      setKeysByPharmacy((prev) => ({ ...prev, [pharmacyId]: json.data ?? [] }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_keys_load_failed'))
    } finally {
      setKeysLoading(null)
    }
  }, [t])

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/pharmacies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          address: createForm.address.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_create_failed'))
      toast.success(t('pharmacies.toast_created'))
      setCreateForm(blankPharmacyForm)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_create_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (p: Pharmacy) => {
    setEditingId(p.id)
    setEditForm({
      name: p.name ?? '',
      address: p.address ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
    })
  }

  const submitEdit = async (id: number) => {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/pharmacies/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_update_failed'))
      toast.success(t('pharmacies.toast_updated'))
      setEditingId(null)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_update_failed'))
    } finally {
      setEditSaving(false)
    }
  }

  const deletePharmacy = async (id: number) => {
    if (!window.confirm(t('pharmacies.confirm_delete_pharmacy'))) {
      return
    }
    try {
      const res = await fetch(`/api/pharmacies/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_delete_failed'))
      toast.success(t('pharmacies.toast_deleted'))
      if (expandedId === id) setExpandedId(null)
      if (editingId === id) setEditingId(null)
      await loadPharmacies()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_delete_failed'))
    }
  }

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!keysByPharmacy[id]) {
      void loadKeys(id)
    }
  }

  const setKeyFormField = (id: number, field: keyof typeof blankKeyForm, value: string) => {
    setKeyForms((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? blankKeyForm), [field]: value },
    }))
  }

  const mintKey = async (pharmacyId: number) => {
    const form = keyForms[pharmacyId] ?? blankKeyForm
    if (!form.key_name.trim()) {
      toast.error(t('pharmacies.toast_key_name_required'))
      return
    }
    setMintingId(pharmacyId)
    try {
      const expiresAt = form.expires_at.trim()
        ? new Date(form.expires_at).toISOString()
        : null

      const res = await fetch(`/api/pharmacies/${pharmacyId}/api-keys`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key_name: form.key_name.trim(),
          expires_at: expiresAt,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_mint_failed'))

      setRevealedKey({
        pharmacyId,
        rawKey: json.raw_key,
        keyName: json.data.key_name,
      })
      setKeyForms((prev) => ({ ...prev, [pharmacyId]: blankKeyForm }))
      await Promise.all([loadKeys(pharmacyId), loadPharmacies()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_mint_failed'))
    } finally {
      setMintingId(null)
    }
  }

  const toggleKeyActive = async (pharmacyId: number, key: ApiKey) => {
    try {
      const res = await fetch(
        `/api/pharmacies/${pharmacyId}/api-keys/${key.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !key.is_active }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_key_update_failed'))
      toast.success(key.is_active ? t('pharmacies.toast_key_revoked') : t('pharmacies.toast_key_reactivated'))
      await Promise.all([loadKeys(pharmacyId), loadPharmacies()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_key_update_failed'))
    }
  }

  const deleteKey = async (pharmacyId: number, keyId: number) => {
    if (!window.confirm(t('pharmacies.confirm_delete_key'))) return
    try {
      const res = await fetch(
        `/api/pharmacies/${pharmacyId}/api-keys/${keyId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('pharmacies.toast_key_delete_failed'))
      toast.success(t('pharmacies.toast_key_deleted'))
      await Promise.all([loadKeys(pharmacyId), loadPharmacies()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pharmacies.toast_key_delete_failed'))
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('pharmacies.toast_copied'))
    } catch {
      toast.error(t('pharmacies.toast_copy_failed'))
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return t('common.em_dash')
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return t('common.em_dash')
    return d.toLocaleString(locale)
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{t('pharmacies.title')}</h1>
        <p className="text-blue-200/90 text-sm max-w-3xl">
          {t('pharmacies.intro_before')}
          <code className="text-cyan-300">GET /api/pharmacy/prescriptions</code>
          {t('pharmacies.intro_after')}
        </p>
      </div>

      {/* Add pharmacy */}
      <form
        onSubmit={submitCreate}
        className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 space-y-4"
      >
        <h2 className="text-lg font-semibold text-white">{t('pharmacies.add_title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-blue-200">{t('pharmacies.name_req')}</label>
            <input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              placeholder={t('pharmacies.name_placeholder')}
            />
          </div>
          <div>
            <label className="text-sm text-blue-200">{t('pharmacies.phone')}</label>
            <input
              value={createForm.phone}
              onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              placeholder={t('pharmacies.phone_placeholder')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">{t('pharmacies.address')}</label>
            <input
              value={createForm.address}
              onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-blue-200">{t('pharmacies.email')}</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white"
              placeholder={t('pharmacies.email_placeholder_form')}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium disabled:opacity-50"
        >
          {submitting ? t('common.saving') : t('pharmacies.save_pharmacy')}
        </button>
      </form>

      {/* Revealed raw key banner */}
      {revealedKey && (
        <div className="bg-amber-500/10 border border-amber-400/40 rounded-2xl p-6 mb-8">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-lg font-semibold text-amber-200">{t('pharmacies.reveal_title')}</h3>
              <p className="text-sm text-amber-100/80">
                {t('pharmacies.reveal_sub', { name: revealedKey.keyName, id: revealedKey.pharmacyId })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="text-amber-200 hover:text-white text-sm"
            >
              {t('pharmacies.dismiss')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 block text-sm text-amber-100 bg-black/30 border border-amber-400/30 rounded-lg p-3 break-all">
              {revealedKey.rawKey}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(revealedKey.rawKey)}
              className="px-4 py-3 bg-amber-400 text-slate-900 rounded-lg font-medium hover:bg-amber-300 transition-colors"
            >
              {t('pharmacies.copy')}
            </button>
          </div>
        </div>
      )}

      {/* Pharmacy list */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{t('pharmacies.list_title')}</h2>
          <span className="text-xs text-blue-200">{t('pharmacies.total_count', { count: rows.length })}</span>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('common.loading')} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-blue-200">{t('pharmacies.empty')}</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {rows.map((p) => {
              const isExpanded = expandedId === p.id
              const isEditing = editingId === p.id
              const keys = keysByPharmacy[p.id]
              const form = keyForms[p.id] ?? blankKeyForm

              return (
                <li key={p.id} className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[260px]">
                      {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder={t('pharmacies.edit_name_placeholder')}
                            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          />
                          <input
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder={t('pharmacies.phone')}
                            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          />
                          <input
                            value={editForm.address}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, address: e.target.value }))
                            }
                            placeholder={t('pharmacies.address')}
                            className="md:col-span-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          />
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder={t('pharmacies.email')}
                            className="md:col-span-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold text-lg">
                              {p.name || t('pharmacies.pharmacy_fallback', { id: p.id })}
                            </span>
                            <span className="text-xs text-blue-300">
                              {t('pharmacies.id_label')} {p.id}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                p.active_key_count > 0
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                  : 'bg-slate-500/20 text-slate-300 border border-slate-400/30'
                              }`}
                            >
                              {p.active_key_count === 1
                                ? t('pharmacies.one_active_key', { n: p.active_key_count })
                                : t('pharmacies.many_active_keys', { n: p.active_key_count })}
                              {p.total_key_count > p.active_key_count
                                ? ` ${t('pharmacies.total_keys_suffix', { total: p.total_key_count })}`
                                : ''}
                            </span>
                          </div>
                          <div className="text-sm text-blue-200 mt-1 space-y-0.5">
                            {p.address && <div>{p.address}</div>}
                            {(p.phone || p.email) && (
                              <div className="text-blue-300">
                                {p.phone}
                                {p.phone && p.email ? ' · ' : ''}
                                {p.email}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => submitEdit(p.id)}
                            disabled={editSaving || !editForm.name.trim()}
                            className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"
                          >
                            {editSaving ? t('common.saving') : t('common.save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 bg-white/10 text-blue-100 rounded-lg text-sm hover:bg-white/20"
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            className="px-3 py-2 bg-white/10 text-blue-100 rounded-lg text-sm hover:bg-white/20"
                          >
                            {isExpanded ? t('pharmacies.hide_keys') : t('pharmacies.manage_keys')}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="px-3 py-2 bg-white/10 text-blue-100 rounded-lg text-sm hover:bg-white/20"
                          >
                            {t('pharmacies.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePharmacy(p.id)}
                            className="px-3 py-2 bg-red-500/20 border border-red-400/40 text-red-200 rounded-lg text-sm hover:bg-red-500/30"
                          >
                            {t('pharmacies.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && !isEditing && (
                    <div className="mt-5 bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-2">{t('pharmacies.mint_key')}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            value={form.key_name}
                            onChange={(e) => setKeyFormField(p.id, 'key_name', e.target.value)}
                            placeholder={t('pharmacies.label_placeholder_long')}
                            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                          />
                          <input
                            type="datetime-local"
                            value={form.expires_at}
                            onChange={(e) => setKeyFormField(p.id, 'expires_at', e.target.value)}
                            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => mintKey(p.id)}
                            disabled={mintingId === p.id || !form.key_name.trim()}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            {mintingId === p.id ? t('pharmacies.generating') : t('pharmacies.generate_key')}
                          </button>
                        </div>
                        <p className="text-xs text-blue-300/70 mt-1">
                          {t('pharmacies.expiry_hint')}
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-white mb-2">{t('pharmacies.existing_keys')}</h4>
                        {keysLoading === p.id && !keys ? (
                          <div className="py-6 flex justify-center">
                            <LoadingSpinner message={t('pharmacies.loading_keys')} />
                          </div>
                        ) : !keys || keys.length === 0 ? (
                          <p className="text-sm text-blue-200">
                            {t('pharmacies.no_keys_pharmacy')}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-blue-300 text-xs uppercase">
                                <tr>
                                  <th className="px-3 py-2">{t('pharmacies.th_label')}</th>
                                  <th className="px-3 py-2">{t('pharmacies.th_prefix')}</th>
                                  <th className="px-3 py-2">{t('pharmacies.th_status')}</th>
                                  <th className="px-3 py-2">{t('pharmacies.th_last_used')}</th>
                                  <th className="px-3 py-2">{t('pharmacies.th_expires')}</th>
                                  <th className="px-3 py-2">{t('pharmacies.th_created')}</th>
                                  <th className="px-3 py-2 text-right">{t('pharmacies.th_actions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {keys.map((k) => {
                                  const expired =
                                    k.expires_at != null &&
                                    new Date(k.expires_at).getTime() <= Date.now()
                                  const effectivelyActive = k.is_active && !expired
                                  return (
                                    <tr key={k.id} className="border-t border-white/10 text-gray-200">
                                      <td className="px-3 py-2 font-medium text-white">
                                        {k.key_name}
                                      </td>
                                      <td className="px-3 py-2">
                                        <code className="text-cyan-300">{k.key_prefix}…</code>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-xs ${
                                            effectivelyActive
                                              ? 'bg-emerald-500/20 text-emerald-300'
                                              : expired
                                                ? 'bg-amber-500/20 text-amber-200'
                                                : 'bg-slate-500/20 text-slate-300'
                                          }`}
                                        >
                                          {expired
                                            ? t('pharmacies.key_expired')
                                            : k.is_active
                                              ? t('pharmacies.key_active')
                                              : t('pharmacies.key_revoked')}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">{formatDate(k.last_used_at)}</td>
                                      <td className="px-3 py-2">{formatDate(k.expires_at)}</td>
                                      <td className="px-3 py-2">{formatDate(k.created_at)}</td>
                                      <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => toggleKeyActive(p.id, k)}
                                          className="px-2 py-1 bg-white/10 text-blue-100 rounded-md text-xs hover:bg-white/20"
                                        >
                                          {k.is_active ? t('pharmacies.revoke') : t('pharmacies.reactivate')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteKey(p.id, k.id)}
                                          className="px-2 py-1 bg-red-500/20 border border-red-400/40 text-red-200 rounded-md text-xs hover:bg-red-500/30"
                                        >
                                          {t('pharmacies.delete')}
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default withRoleProtection(PharmaciesPage, {
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE],
  redirectTo: '/dashboard',
})
