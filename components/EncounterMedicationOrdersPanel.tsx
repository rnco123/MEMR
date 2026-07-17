'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type OrderKind = 'lab' | 'medication'

type CatalogProduct = {
  id: number
  category: string
  product: string
  price: number | string
}

type SavedOrder = {
  id: number
  qty: number
  product: CatalogProduct | CatalogProduct[] | null
}

type PendingOrder = {
  key: string
  product: CatalogProduct
  qty: number
}

type CatalogBuilderProps = {
  encounterId: number
  kind: OrderKind
  title: string
  subtitle: string
  products: CatalogProduct[]
  savedOrders: SavedOrder[]
  canEdit: boolean
  emptyCatalogLabel: string
  emptyLinesLabel: string
  onReload: () => Promise<void>
}

function normalizeJoinedProduct(value: SavedOrder['product']): CatalogProduct | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function SavedOrderLine({
  encounterId,
  kind,
  order,
  canEdit,
  onReload,
}: {
  encounterId: number
  kind: OrderKind
  order: SavedOrder
  canEdit: boolean
  onReload: () => Promise<void>
}) {
  const { t } = useT()
  const product = normalizeJoinedProduct(order.product)
  const [qty, setQty] = useState(order.qty)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    setQty(order.qty)
  }, [order.qty])

  const updateOrder = async () => {
    if (!canEdit || qty === order.qty || working) return
    setWorking(true)
    try {
      const res = await fetch(
        `/api/encounters/${encounterId}/catalog-orders/${kind}/${order.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qty }),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('encounter_modal.catalog_update_failed'))
      toast.success(t('encounter_modal.catalog_order_updated'))
      await onReload()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_modal.catalog_update_failed')
      )
    } finally {
      setWorking(false)
    }
  }

  const deleteOrder = async () => {
    if (!canEdit || working) return
    setWorking(true)
    try {
      const res = await fetch(
        `/api/encounters/${encounterId}/catalog-orders/${kind}/${order.id}`,
        { method: 'DELETE', credentials: 'include' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('encounter_modal.catalog_delete_failed'))
      toast.success(t('encounter_modal.catalog_order_removed'))
      await onReload()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_modal.catalog_delete_failed')
      )
    } finally {
      setWorking(false)
    }
  }

  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div>
        <p className="font-semibold text-slate-900">
          {product?.product || t('common.unknown')}
        </p>
        <p className="text-xs text-slate-500">{product?.category || '—'}</p>
      </div>
      {canEdit ? (
        <input
          type="number"
          min={1}
          max={999}
          value={qty}
          disabled={working}
          onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
          className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm text-slate-800"
          aria-label={t('encounter_modal.med_orders_quantity')}
        />
      ) : (
        <p className="text-sm text-slate-600">× {order.qty}</p>
      )}
      {canEdit && (
        <div className="flex gap-3 text-sm font-semibold">
          <button
            type="button"
            disabled={working || qty === order.qty}
            onClick={() => void updateOrder()}
            className="text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void deleteOrder()}
            className="text-rose-600 hover:text-rose-700 disabled:opacity-40"
          >
            {t('common.remove')}
          </button>
        </div>
      )}
    </li>
  )
}

function SearchableProductSelect({
  products,
  value,
  disabled,
  placeholder,
  noResultsLabel,
  clearLabel,
  onChange,
}: {
  products: CatalogProduct[]
  value: number | ''
  disabled: boolean
  placeholder: string
  noResultsLabel: string
  clearLabel: string
  onChange: (value: number | '') => void
}) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === value) ?? null,
    [products, value]
  )
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return products
    return products.filter((product) =>
      product.product.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [products, query])

  useEffect(() => {
    setQuery(selectedProduct?.product ?? '')
  }, [selectedProduct])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query, products])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  const selectProduct = (product: CatalogProduct) => {
    onChange(product.id)
    setQuery(product.product)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex h-10 items-center rounded-lg border bg-white transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/25 ${
          disabled ? 'border-slate-200 bg-slate-50' : 'border-slate-200'
        }`}
      >
        <svg
          className="ml-3 h-4 w-4 shrink-0 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            onChange('')
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex((current) =>
                filteredProducts.length === 0
                  ? 0
                  : Math.min(current + 1, filteredProducts.length - 1)
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlightedIndex((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter' && open && filteredProducts[highlightedIndex]) {
              event.preventDefault()
              selectProduct(filteredProducts[highlightedIndex])
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        />
        {query && !disabled ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              setQuery('')
              onChange('')
              setOpen(true)
            }}
            className="mr-1.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          {filteredProducts.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-slate-500">{noResultsLabel}</p>
          ) : (
            filteredProducts.map((product, index) => (
              <button
                key={product.id}
                type="button"
                role="option"
                aria-selected={product.id === value}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectProduct(product)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  index === highlightedIndex
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="truncate font-medium">{product.product}</span>
                {product.id === value ? (
                  <svg className="ml-2 h-4 w-4 shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m5 12 4 4L19 6" />
                  </svg>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function CatalogBuilder({
  encounterId,
  kind,
  title,
  subtitle,
  products,
  savedOrders,
  canEdit,
  emptyCatalogLabel,
  emptyLinesLabel,
  onReload,
}: CatalogBuilderProps) {
  const { t } = useT()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [quantity, setQuantity] = useState(1)
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [saving, setSaving] = useState(false)

  const categories = useMemo(
    () =>
      [...new Set(products.map((item) => item.category.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [products]
  )

  const categoryProducts = useMemo(
    () => products.filter((item) => item.category.trim() === selectedCategory),
    [products, selectedCategory]
  )

  const selectedProduct = useMemo(
    () =>
      selectedProductId === ''
        ? null
        : products.find((item) => item.id === selectedProductId) ?? null,
    [products, selectedProductId]
  )

  const addPendingOrder = () => {
    if (!selectedProduct || quantity < 1) return
    setPendingOrders((current) => [
      ...current,
      {
        key: `${selectedProduct.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        product: selectedProduct,
        qty: quantity,
      },
    ])
    setSelectedProductId('')
    setQuantity(1)
  }

  const savePendingOrders = async () => {
    if (!canEdit || pendingOrders.length === 0 || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/encounters/${encounterId}/catalog-orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          rows: pendingOrders.map((order) => ({
            product_id: order.product.id,
            qty: order.qty,
          })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('encounter_modal.catalog_save_failed'))

      setPendingOrders([])
      toast.success(t('encounter_modal.catalog_orders_saved'))
      await onReload()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('encounter_modal.catalog_save_failed')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h4 className="text-base font-bold text-slate-900">{title}</h4>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {emptyCatalogLabel}
        </p>
      ) : (
        <>
          {canEdit && (
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {t('encounter_modal.med_orders_category')}
                </label>
                <select
                  value={selectedCategory}
                  onChange={(event) => {
                    setSelectedCategory(event.target.value)
                    setSelectedProductId('')
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t('encounter_modal.med_orders_select_category')}</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {t('encounter_modal.med_orders_product')}
                </label>
                <SearchableProductSelect
                  products={categoryProducts}
                  value={selectedProductId}
                  disabled={!selectedCategory}
                  placeholder={`${t('common.search')} ${t('encounter_modal.med_orders_product').toLocaleLowerCase()}…`}
                  noResultsLabel={t('common.no_results')}
                  clearLabel={t('common.clear_search')}
                  onChange={setSelectedProductId}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {t('encounter_modal.med_orders_quantity')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={addPendingOrder}
                disabled={!selectedProduct}
                className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('encounter_modal.med_orders_add')}
              </button>
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            {savedOrders.length === 0 && pendingOrders.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-slate-500">{emptyLinesLabel}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {savedOrders.map((order) => (
                  <SavedOrderLine
                    key={`saved-${order.id}`}
                    encounterId={encounterId}
                    kind={kind}
                    order={order}
                    canEdit={canEdit}
                    onReload={onReload}
                  />
                ))}
                {pendingOrders.map((order) => (
                    <li
                      key={order.key}
                      className="grid grid-cols-1 gap-3 bg-indigo-50/40 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{order.product.product}</p>
                        <p className="text-xs text-slate-500">{order.product.category}</p>
                      </div>
                      <p className="text-sm text-slate-600">
                        × {order.qty}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingOrders((current) =>
                            current.filter((item) => item.key !== order.key)
                          )
                        }
                        className="text-left text-sm font-semibold text-rose-600 hover:text-rose-700 sm:text-right"
                      >
                        {t('common.remove')}
                      </button>
                    </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit && pendingOrders.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void savePendingOrders()}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving
                  ? t('common.saving')
                  : t('encounter_modal.med_orders_save', { count: pendingOrders.length })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

type Props = {
  encounterId: number
  canEdit: boolean
}

export function EncounterMedicationOrdersPanel({ encounterId, canEdit }: Props) {
  const { t } = useT()
  const [loading, setLoading] = useState(true)
  const [labs, setLabs] = useState<CatalogProduct[]>([])
  const [medications, setMedications] = useState<CatalogProduct[]>([])
  const [labOrders, setLabOrders] = useState<SavedOrder[]>([])
  const [medicationOrders, setMedicationOrders] = useState<SavedOrder[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [catalogRes, ordersRes] = await Promise.all([
        fetch('/api/catalog-products', { credentials: 'include' }),
        fetch(`/api/encounters/${encounterId}/catalog-orders`, { credentials: 'include' }),
      ])
      const [catalogJson, ordersJson] = await Promise.all([
        catalogRes.json().catch(() => ({})),
        ordersRes.json().catch(() => ({})),
      ])
      if (!catalogRes.ok) {
        throw new Error(catalogJson.error || t('encounter_modal.catalog_load_failed'))
      }
      if (!ordersRes.ok) {
        throw new Error(ordersJson.error || t('encounter_modal.med_orders_load_failed'))
      }

      setLabs((catalogJson.labs as CatalogProduct[]) ?? [])
      setMedications((catalogJson.medications as CatalogProduct[]) ?? [])
      setLabOrders((ordersJson.labs as SavedOrder[]) ?? [])
      setMedicationOrders((ordersJson.medications as SavedOrder[]) ?? [])
    } catch (error) {
      setLabs([])
      setMedications([])
      setLabOrders([])
      setMedicationOrders([])
      toast.error(
        error instanceof Error ? error.message : t('encounter_modal.med_orders_load_failed')
      )
    } finally {
      setLoading(false)
    }
  }, [encounterId, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm ring-1 ring-indigo-100">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">
          {t('encounter_modal.catalog_sections_title')}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {t('encounter_modal.catalog_orders_edit_hint')}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{t('encounter_modal.med_orders_loading')}</p>
      ) : (
        <div className="space-y-5">
          <CatalogBuilder
            key={`medications-${encounterId}`}
            encounterId={encounterId}
            kind="medication"
            title={t('encounter_modal.med_orders_title')}
            subtitle={t('encounter_modal.med_catalog_subtitle')}
            products={medications}
            savedOrders={medicationOrders}
            canEdit={canEdit}
            emptyCatalogLabel={t('encounter_modal.med_catalog_empty')}
            emptyLinesLabel={t('encounter_modal.med_orders_empty')}
            onReload={loadData}
          />
          <CatalogBuilder
            key={`labs-${encounterId}`}
            encounterId={encounterId}
            kind="lab"
            title={t('encounter_modal.lab_orders_title')}
            subtitle={t('encounter_modal.lab_catalog_subtitle')}
            products={labs}
            savedOrders={labOrders}
            canEdit={canEdit}
            emptyCatalogLabel={t('encounter_modal.lab_catalog_empty')}
            emptyLinesLabel={t('encounter_modal.lab_orders_empty')}
            onReload={loadData}
          />
        </div>
      )}
    </section>
  )
}
