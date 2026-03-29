'use client'

import { withRoleProtection } from '@/lib/hoc/withRoleProtection'
import { UserRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { toast } from 'sonner'

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
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Clinical orders</h1>
          <p className="text-blue-200/90 text-sm">
            Lab draws, injections, immunizations, POC tests, referrals. Log orders by encounter; MA marks progress.
          </p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'all', 'completed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                filter === f ? 'bg-blue-500 text-white' : 'bg-white/10 text-blue-200'
              }`}
            >
              {f === 'pending' ? 'Open' : f === 'all' ? 'All' : 'Done'}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={createOrder}
        className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
      >
        <div className="md:col-span-2">
          <label className="text-xs text-blue-200 block mb-1">Encounter ID</label>
          <input
            required
            value={newOrder.encounter_id}
            onChange={(e) => setNewOrder((n) => ({ ...n, encounter_id: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm"
            placeholder="From flowboard / video"
          />
        </div>
        <div>
          <label className="text-xs text-blue-200 block mb-1">Type</label>
          <select
            value={newOrder.order_type}
            onChange={(e) =>
              setNewOrder((n) => ({ ...n, order_type: e.target.value as OrderRow['order_type'] }))
            }
            className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm"
          >
            <option value="lab_draw">Lab draw</option>
            <option value="injection">Injection</option>
            <option value="immunization">Immunization</option>
            <option value="poc_test">POC test</option>
            <option value="referral">Referral</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-blue-200 block mb-1">Title</label>
          <input
            required
            value={newOrder.title}
            onChange={(e) => setNewOrder((n) => ({ ...n, title: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-6">
          <label className="text-xs text-blue-200 block mb-1">Instructions</label>
          <input
            value={newOrder.instructions}
            onChange={(e) => setNewOrder((n) => ({ ...n, instructions: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-6">
          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
          >
            {creating ? 'Saving…' : 'Log order'}
          </button>
        </div>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner message="Loading orders…" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-blue-200">No orders match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-blue-200">
                <tr>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Encounter</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/10 text-gray-200">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : `#${r.patient_id}`}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.order_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-white">{r.title}</div>
                      {r.instructions && <div className="text-xs text-gray-400 mt-0.5">{r.instructions}</div>}
                    </td>
                    <td className="px-4 py-3">{r.encounter_id}</td>
                    <td className="px-4 py-3 capitalize">{r.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 space-x-1">
                      {r.status !== 'completed' && r.status !== 'cancelled' && (
                        <>
                          <button
                            type="button"
                            className="text-xs text-amber-300 hover:underline"
                            onClick={() => setStatus(r.id, 'in_progress')}
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            className="text-xs text-green-300 hover:underline ml-2"
                            onClick={() => setStatus(r.id, 'completed')}
                          >
                            Done
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
  allowedRoles: [UserRole.DOCTOR, UserRole.NURSE, UserRole.STAFF],
  redirectTo: '/dashboard',
})
