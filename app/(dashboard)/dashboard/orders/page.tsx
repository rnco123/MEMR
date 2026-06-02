'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type OrderRow = {
  id: number
  encounter_id: number
  patient_id: number
  order_type: 'lab_draw' | 'injection' | 'immunization' | 'poc_test' | 'referral' | 'other'
  title: string
  instructions: string | null
  status: string
  created_at: string
  patients: { first_name: string; last_name: string } | null
}

function OrdersPage() {
  const supabase = useMemo(() => createClient(), [])
  const { t } = useT()
  const [rows, setRows] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const [creating, setCreating] = useState(false)
  const [newOrder, setNewOrder] = useState({
    encounter_id: '',
    order_type: 'lab_draw' as OrderRow['order_type'],
    title: '',
    instructions: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('encounter_orders')
        .select(
          `
          id,
          encounter_id,
          patient_id,
          order_type,
          title,
          instructions,
          status,
          created_at,
          patients:patient_id ( first_name, last_name )
        `
        )
        .order('created_at', { ascending: false })
        .limit(200)

      if (filter === 'pending') {
        q = q.in('status', ['pending', 'in_progress'])
      } else if (filter === 'completed') {
        q = q.eq('status', 'completed')
      }

      const { data, error } = await q
      if (error) throw error
      setRows((data as unknown as OrderRow[]) ?? [])
    } catch (e) {
      console.error(e)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [supabase, filter])

  useEffect(() => {
    load()
  }, [load])

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    const encId = Number(newOrder.encounter_id)
    if (!Number.isFinite(encId)) {
      toast.error('Enter a valid encounter ID')
      return
    }
    setCreating(true)
    try {
      const res = await fetch(`/api/encounters/${encId}/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: newOrder.order_type,
          title: newOrder.title.trim(),
          instructions: newOrder.instructions.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Order created')
      setNewOrder((n) => ({ ...n, title: '', instructions: '' }))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const setStatus = async (orderId: number, status: 'pending' | 'in_progress' | 'completed' | 'cancelled') => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      toast.success('Order updated')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">{t('orders.title')}</h1>
          <p className="text-slate-500 text-sm">
            {t('orders.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all', 'completed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filter === f
                  ? 'bg-[#2E6EF3] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f === 'pending' ? t('orders.filter_open') : f === 'all' ? t('orders.filter_all') : t('orders.filter_done')}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={createOrder}
        className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
      >
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('orders.encounter_id')}</label>
          <input
            required
            value={newOrder.encounter_id}
            onChange={(e) => setNewOrder((n) => ({ ...n, encounter_id: e.target.value }))}
            className="w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
            placeholder={t('orders.encounter_placeholder')}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('common.type')}</label>
          <select
            value={newOrder.order_type}
            onChange={(e) =>
              setNewOrder((n) => ({ ...n, order_type: e.target.value as OrderRow['order_type'] }))
            }
            className="w-full h-10 bg-white border border-slate-200 rounded-lg px-3 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
          >
            <option value="lab_draw">{t('orders.type_lab')}</option>
            <option value="injection">{t('orders.type_injection')}</option>
            <option value="immunization">{t('orders.type_immunization')}</option>
            <option value="poc_test">{t('orders.type_poc')}</option>
            <option value="referral">{t('orders.type_referral')}</option>
            <option value="other">{t('orders.type_other')}</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('orders.title_field')}</label>
          <input
            required
            value={newOrder.title}
            onChange={(e) => setNewOrder((n) => ({ ...n, title: e.target.value }))}
            className="w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-6">
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('orders.instructions')}</label>
          <input
            value={newOrder.instructions}
            onChange={(e) => setNewOrder((n) => ({ ...n, instructions: e.target.value }))}
            className="w-full h-10 bg-[#f9fbff] border border-slate-200 rounded-lg px-3 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E6EF3]"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-6">
          <button
            type="submit"
            disabled={creating}
            className="px-5 h-10 rounded-lg bg-[#2E6EF3] hover:bg-[#1f5ad2] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {creating ? t('common.saving') : t('orders.log')}
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message={t('orders.loading')} />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-slate-500 text-sm">{t('orders.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('common.created')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.col_patient')}</th>
                  <th className="px-4 py-3 font-semibold">{t('common.type')}</th>
                  <th className="px-4 py-3 font-semibold">{t('common.title')}</th>
                  <th className="px-4 py-3 font-semibold">{t('orders.col_encounter')}</th>
                  <th className="px-4 py-3 font-semibold">{t('common.status')}</th>
                  <th className="px-4 py-3 font-semibold">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 text-slate-700 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : `#${r.patient_id}`}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.order_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-semibold text-slate-900">{r.title}</div>
                      {r.instructions && <div className="text-xs text-slate-500 mt-0.5">{r.instructions}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.encounter_id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        r.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.status === 'cancelled' ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : r.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-[#2E6EF3]/10 text-[#2E6EF3] border-[#2E6EF3]/20'
                      }`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-3">
                      {r.status !== 'completed' && r.status !== 'cancelled' && (
                        <>
                          <button
                            type="button"
                            className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
                            onClick={() => setStatus(r.id, 'in_progress')}
                          >
                            {t('common.start')}
                          </button>
                          <button
                            type="button"
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                            onClick={() => setStatus(r.id, 'completed')}
                          >
                            {t('common.done')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default withRoleProtection(OrdersPage, {
  allowedRoles: [UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE],
  redirectTo: '/dashboard',
})
