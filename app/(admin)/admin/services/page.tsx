'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdminService } from '@/lib/services/admin-service'

type Draft = {
  title_en: string
  title_es: string
  description_en: string
  description_es: string
  image: string
  icon: string
  slug: string
}

const EMPTY: Draft = {
  title_en: '',
  title_es: '',
  description_en: '',
  description_es: '',
  image: '',
  icon: '',
  slug: '',
}

const toDraft = (service: AdminService): Draft => ({
  title_en: service.title_en ?? '',
  title_es: service.title_es ?? '',
  description_en: service.description_en ?? '',
  description_es: service.description_es ?? '',
  image: service.image ?? '',
  icon: service.icon ?? '',
  slug: service.slug ?? '',
})

/** Empty strings are cleared values, so they go to the API as null. */
const toPayload = (draft: Draft) =>
  Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, value.trim() ? value.trim() : null])
  )

export default function AdminServicesPage() {
  const [services, setServices] = useState<AdminService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/services')
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || 'Failed to load services')
      setServices(body.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return services
    return services.filter((s) =>
      [s.title_en, s.title_es, s.slug].some((v) => (v ?? '').toLowerCase().includes(term))
    )
  }, [services, search])

  const startCreate = () => {
    setEditingId('new')
    setDraft(EMPTY)
    setNotice(null)
  }

  const startEdit = (service: AdminService) => {
    setEditingId(service.id)
    setDraft(toDraft(service))
    setNotice(null)
  }

  const cancel = () => {
    setEditingId(null)
    setDraft(EMPTY)
  }

  const save = async () => {
    if (!draft.title_en.trim()) {
      setError('English title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const isNew = editingId === 'new'
      const response = await fetch(
        isNew ? '/api/admin/services' : `/api/admin/services/${editingId}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPayload(draft)),
        }
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || 'Failed to save service')

      setNotice(
        body.portal_synced
          ? 'Saved and synced to the public site.'
          : 'Saved in the EMR, but the public site copy did not update. It will sync on the next save.'
      )
      cancel()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (service: AdminService) => {
    if (!confirm(`Delete "${service.title_en}"? This removes it from the public site too.`)) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || 'Failed to delete service')
      setNotice('Service deleted.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof Draft, label: string, opts: { textarea?: boolean } = {}) => (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      {opts.textarea ? (
        <textarea
          rows={3}
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  )

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Services</h1>
          <p className="text-sm text-gray-500">
            Managed here and published to the public site automatically.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
        >
          Add service
        </button>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </div>
      )}

      {editingId !== null && (
        <section className="rounded border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {editingId === 'new' ? 'New service' : `Editing service #${editingId}`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('title_en', 'Title (English)')}
            {field('title_es', 'Title (Spanish)')}
            {field('description_en', 'Description (English)', { textarea: true })}
            {field('description_es', 'Description (Spanish)', { textarea: true })}
            {field('image', 'Image URL')}
            {field('icon', 'Icon URL')}
            {field('slug', 'Slug')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search services…"
        className="w-full max-w-sm rounded border border-gray-300 px-3 py-1.5 text-sm"
      />

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">English</th>
              <th className="px-3 py-2">Spanish</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No services found.
                </td>
              </tr>
            ) : (
              visible.map((service) => (
                <tr key={service.id}>
                  <td className="px-3 py-2 text-gray-500">{service.id}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{service.title_en}</td>
                  <td className="px-3 py-2 text-gray-700">{service.title_es}</td>
                  <td className="px-3 py-2 text-gray-500">{service.slug}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => startEdit(service)}
                      className="text-purple-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(service)}
                      className="ml-3 text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
