'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getProfileId, insertStatusTimeline } from '@/lib/status-timeline'
import { LoadingSpinner } from './LoadingSpinner'

interface Patient {
  id: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
  zip_code: string | null
  state: string | null
  street_address: string | null
  patient_code: string | null
}

interface IntakeForm {
  id: number
  appointment_id: number
  chief_complaint: string | null
  location: string | null
  severity: number | null
  symptoms_description: string | null
  medical_conditions: any
  surgeries: any
  allergies: any
  current_medications: any
  fh_diabetes: boolean | null
  fh_hypertension: boolean | null
  fh_cancer: boolean | null
  fh_heart_disease: boolean | null
  tobacco_use: boolean | null
  alcohol_use: boolean | null
  drug_use: boolean | null
  onset: string | null
}

interface Vitals {
  id: number
  encounter_id: number
  bp_systolic: number | null
  bp_diastolic: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature: number | null
  temperature_unit: string | null
  spo2: number | null
  weight: number | null
  weight_unit: string | null
  height: number | null
  height_unit: string | null
  bmi: number | null
  notes: string | null
  created_at: string
}

interface SOAPNotes {
  id: number
  encounter_id: number | null
  subjective_text: string | null
  objective_text: string | null
  assessment_text: string | null
  plan_text: string | null
  created_at: string
  updated_at: string
}

interface Pharmacy {
  id: number
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

interface CategoryMemr {
  id: number
  name: string
}

/** Product from public.products (pre_sales.product_id references products.product_id) */
interface ProductRow {
  product_id: number
  product_name: string
  category_id?: number
}

interface PreSalesProduct {
  id: string
  product_id: number
  product_name: string
  quantity: number
}

interface FinalReviewModalProps {
  encounterId: number
  appointmentId: number
  patientId: number
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

export function FinalReviewModal({
  encounterId,
  appointmentId,
  patientId,
  isOpen,
  onClose,
  onComplete,
}: FinalReviewModalProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<IntakeForm | null>(null)
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [soapNotes, setSoapNotes] = useState<SOAPNotes | null>(null)
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null)
  const [preSalesProducts, setPreSalesProducts] = useState<PreSalesProduct[]>([])
  const [activeTab, setActiveTab] = useState<'review' | 'products'>('review')
  const [saving, setSaving] = useState(false)

  // Categories (category_memr) and products (public.products – pre_sales refs products.product_id)
  const [categories, setCategories] = useState<CategoryMemr[]>([])
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productsError, setProductsError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('')
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [productQuantity, setProductQuantity] = useState(1)

  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch patient
        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single()
        setPatient(patientData as Patient)

        // Fetch encounter
        const { data: encounterData } = await supabase
          .from('encounters')
          .select('*')
          .eq('id', encounterId)
          .single()

        // Fetch intake form: try encounter.intake_id first, then by appointment_id
        let intakeData: unknown = null
        if (encounterData?.intake_id) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('id', encounterData.intake_id)
            .maybeSingle()
          intakeData = res.data
        }
        if (!intakeData && appointmentId) {
          const res = await supabase
            .from('intake_form')
            .select('*')
            .eq('appointment_id', appointmentId)
            .maybeSingle()
          intakeData = res.data
        }
        if (intakeData) setIntake(intakeData as IntakeForm)

        // Fetch vitals
        const { data: vitalsData } = await supabase
          .from('vitals')
          .select('*')
          .eq('encounter_id', encounterId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setVitals(vitalsData as Vitals)

        // Fetch SOAP notes
        const { data: soapData } = await supabase
          .from('ai_soapnotes')
          .select('*')
          .eq('encounter_id', encounterId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setSoapNotes(soapData as SOAPNotes)

        // Fetch pharmacy
        if (encounterData?.pharmacy_id) {
          const { data: pharmacyData } = await supabase
            .from('pharmacy')
            .select('*')
            .eq('id', encounterData.pharmacy_id)
            .maybeSingle()
          setPharmacy(pharmacyData as Pharmacy)
        }

        // Categories for pre-sales (category_memr)
        setCategoriesError(null)
        const { data: categoriesData, error: categoriesErr } = await supabase
          .from('category_memr')
          .select('id, name')
          .order('name')
        if (categoriesErr) {
          console.error('Error fetching category_memr:', categoriesErr)
          setCategoriesError(categoriesErr.message || 'Failed to load categories')
          setCategories([])
        } else {
          setCategories((categoriesData as CategoryMemr[]) || [])
        }

        // Existing pre_sales for this encounter
        const { data: preSalesData } = await supabase
          .from('pre_sales')
          .select('id, product_id, product_quantity')
          .eq('encounter_id', encounterId)
        if (preSalesData?.length) {
          const productIds = [...new Set(preSalesData.map((r: { product_id: number | null }) => r.product_id).filter(Boolean))]
          const { data: productRows } = await supabase
            .from('products')
            .select('product_id, product_name')
            .in('product_id', productIds)
          const nameMap = new Map((productRows || []).map((p: { product_id: number; product_name: string }) => [p.product_id, p.product_name]))
          setPreSalesProducts(
            preSalesData.map((r: { id: number; product_id: number | null; product_quantity: number }) => ({
              id: `db-${r.id}`,
              product_id: r.product_id ?? 0,
              product_name: nameMap.get(r.product_id ?? 0) ?? 'Unknown',
              quantity: r.product_quantity,
            }))
          )
        }
      } catch (error) {
        console.error('Error fetching final review data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, encounterId, appointmentId, patientId, supabase])

  // When category changes, fetch products from public.products (pre_sales refs products.product_id)
  // Load all products so dropdown always populates (category_id in products may not match category_memr ids)
  useEffect(() => {
    if (!selectedCategoryId) {
      setProducts([])
      setProductsError(null)
      setSelectedProductId('')
      return
    }
    const load = async () => {
      setProductsError(null)
      const { data, error } = await supabase
        .from('products')
        .select('product_id, product_name')
        .order('product_name')
      if (error) {
        console.error('Error fetching products:', error)
        setProductsError(error.message || 'Failed to load products')
        setProducts([])
      } else {
        setProducts((data as ProductRow[]) || [])
      }
      setSelectedProductId('')
    }
    load()
  }, [selectedCategoryId, supabase])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const calculateAge = (dob: string | null) => {
    if (!dob) return 'N/A'
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const handleAddProduct = () => {
    if (!selectedProductId || productQuantity < 1) return
    const product = products.find((p) => p.product_id === selectedProductId)
    if (!product) return
    const item: PreSalesProduct = {
      id: Date.now().toString(),
      product_id: product.product_id,
      product_name: product.product_name,
      quantity: productQuantity,
    }
    setPreSalesProducts([...preSalesProducts, item])
    setSelectedProductId('')
    setProductQuantity(1)
  }

  const handleRemoveProduct = (id: string) => {
    setPreSalesProducts(preSalesProducts.filter(p => p.id !== id))
  }

  const handleCompleteReview = async () => {
    setSaving(true)
    try {
      // Update encounter status to final_review
      const { error: updateError } = await supabase
        .from('encounters')
        .update({ status: 'final_review' })
        .eq('id', encounterId)

      if (updateError) {
        console.error('Error updating encounter status:', updateError)
        alert('Error updating encounter status. Please try again.')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const profileId = user ? await getProfileId(supabase, user.id) : null
      await insertStatusTimeline(supabase, {
        encounterId,
        status: 'final_review',
        profileId,
      })

      // Insert new pre_sales rows (only those added in this session, not already from DB)
      for (const p of preSalesProducts) {
        if (String(p.id).startsWith('db-')) continue
        const { error: insertErr } = await supabase.from('pre_sales').insert({
          encounter_id: encounterId,
          product_id: p.product_id,
          product_quantity: p.quantity,
          status: 'pending',
        })
        if (insertErr) {
          console.error('Error inserting pre_sales:', insertErr)
        }
      }

      if (onComplete) {
        onComplete()
      }
      onClose()
    } catch (error) {
      console.error('Error completing final review:', error)
      alert('Error completing review. Please try again.')
    } finally {
      setSaving(false)
    }
  }


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-800 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-white">Final Review</h2>
            {patient && (
              <span className="text-sm text-blue-300">
                {patient.first_name} {patient.last_name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-slate-800 flex-shrink-0">
          <button
            onClick={() => setActiveTab('review')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'review'
                ? 'text-white border-b-2 border-cyan-500 bg-white/5'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Patient Review
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'products'
                ? 'text-white border-b-2 border-cyan-500 bg-white/5'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Pre-Sales Products
            {preSalesProducts.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full text-xs">
                {preSalesProducts.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner message="Loading review data..." />
            </div>
          ) : (
            <>
              {activeTab === 'review' && (
                <div className="space-y-6">
                  {/* Patient Information */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Patient Information
                    </h3>
                    {patient ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Name</p>
                          <p className="text-white font-semibold">{patient.first_name} {patient.last_name}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Patient Code</p>
                          <p className="text-white font-mono">{patient.patient_code || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Age</p>
                          <p className="text-white">{calculateAge(patient.date_of_birth)} years</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Gender</p>
                          <p className="text-white">{patient.gender || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Date of Birth</p>
                          <p className="text-white">{formatDate(patient.date_of_birth)}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Email</p>
                          <p className="text-white">{patient.email || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Phone</p>
                          <p className="text-white">{patient.phone || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Address</p>
                          <p className="text-white">
                            {patient.street_address || 'N/A'}
                            {patient.state && `, ${patient.state}`}
                            {patient.zip_code && ` ${patient.zip_code}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Patient information not available</p>
                    )}
                  </div>

                  {/* Intake Form */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Intake Form
                    </h3>
                    {intake ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Chief Complaint</p>
                          <p className="text-white">{intake.chief_complaint || 'N/A'}</p>
                        </div>
                        {intake.symptoms_description && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Symptoms Description</p>
                            <p className="text-white">{intake.symptoms_description}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {intake.medical_conditions && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Medical Conditions</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.medical_conditions)
                                  ? intake.medical_conditions.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.allergies && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Allergies</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.allergies)
                                  ? intake.allergies.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.current_medications && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Current Medications</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.current_medications)
                                  ? intake.current_medications.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                          {intake.surgeries && (
                            <div>
                              <p className="text-blue-200 text-sm mb-1">Surgeries</p>
                              <p className="text-white text-sm">
                                {Array.isArray(intake.surgeries)
                                  ? intake.surgeries.join(', ')
                                  : 'N/A'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Intake form not available</p>
                    )}
                  </div>

                  {/* Vitals */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Vitals
                    </h3>
                    {vitals ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Blood Pressure</p>
                          <p className="text-white font-semibold">
                            {vitals.bp_systolic && vitals.bp_diastolic
                              ? `${vitals.bp_systolic}/${vitals.bp_diastolic} mmHg`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Heart Rate</p>
                          <p className="text-white font-semibold">
                            {vitals.heart_rate ? `${vitals.heart_rate} bpm` : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">Temperature</p>
                          <p className="text-white font-semibold">
                            {vitals.temperature
                              ? `${vitals.temperature}°${vitals.temperature_unit || 'F'}`
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-1">SpO2</p>
                          <p className="text-white font-semibold">
                            {vitals.spo2 ? `${vitals.spo2}%` : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">Vitals not recorded</p>
                    )}
                  </div>

                  {/* SOAP Notes */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      SOAP Notes
                    </h3>
                    {soapNotes ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Subjective</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.subjective_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Objective</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.objective_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Assessment</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.assessment_text || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-200 text-sm mb-2 font-semibold">Plan</p>
                          <p className="text-white bg-white/5 p-3 rounded-lg">
                            {soapNotes.plan_text || 'N/A'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-200">SOAP notes not available</p>
                    )}
                  </div>

                  {/* Pharmacy */}
                  {pharmacy && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Pharmacy
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pharmacy.name && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Name</p>
                            <p className="text-white font-semibold">{pharmacy.name}</p>
                          </div>
                        )}
                        {pharmacy.address && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Address</p>
                            <p className="text-white">{pharmacy.address}</p>
                          </div>
                        )}
                        {pharmacy.phone && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Phone</p>
                            <p className="text-white">{pharmacy.phone}</p>
                          </div>
                        )}
                        {pharmacy.email && (
                          <div>
                            <p className="text-blue-200 text-sm mb-1">Email</p>
                            <p className="text-white">{pharmacy.email}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'products' && (
                <div className="space-y-6">
                  {/* Add Product Form */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Add Product to Pre-Sales</h3>
                    <p className="text-blue-200/80 text-sm mb-4">One encounter can have multiple products.</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">Category</label>
                        <select
                          value={selectedCategoryId}
                          onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">Select category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {categoriesError && (
                          <p className="text-red-400 text-xs mt-1">{categoriesError}</p>
                        )}
                        {!categoriesError && categories.length === 0 && !loading && (
                          <p className="text-amber-400 text-xs mt-1">No categories. Run migration 029 and add rows to category_memr.</p>
                        )}
                      </div>
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">Product</label>
                        <select
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
                          disabled={!selectedCategoryId}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.product_id} value={p.product_id}>
                              {p.product_name}
                            </option>
                          ))}
                        </select>
                        {productsError && (
                          <p className="text-red-400 text-xs mt-1">{productsError}</p>
                        )}
                        {selectedCategoryId && !productsError && products.length === 0 && (
                          <p className="text-amber-400 text-xs mt-1">No products in this category. Add rows to products for this category.</p>
                        )}
                      </div>
                      <div>
                        <label className="text-blue-200 text-sm mb-1 block">QTY</label>
                        <input
                          type="number"
                          min="1"
                          value={productQuantity}
                          onChange={(e) => setProductQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <button
                          onClick={handleAddProduct}
                          disabled={!selectedProductId || productQuantity < 1}
                          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                        >
                          + Add Product
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Products List */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">Pre-Sales Products</h3>
                    {preSalesProducts.length === 0 ? (
                      <p className="text-blue-200">No products added yet. Select category, then product, then QTY and click Add Product.</p>
                    ) : (
                      <div className="space-y-3">
                        {preSalesProducts.map((product) => (
                          <div
                            key={product.id}
                            className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <p className="text-white font-semibold">{product.product_name}</p>
                              <p className="text-sm text-gray-300 mt-1">Qty: {product.quantity}</p>
                            </div>
                            {!String(product.id).startsWith('db-') && (
                              <button
                                onClick={() => handleRemoveProduct(product.id)}
                                className="ml-4 p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-slate-800 flex-shrink-0">
          <div className="text-sm text-gray-400">
            {preSalesProducts.length > 0 && (
              <span>{preSalesProducts.length} product(s) in pre-sales</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCompleteReview}
              disabled={saving}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Completing...' : 'Complete Final Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
