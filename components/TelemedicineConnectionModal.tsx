'use client'

interface TelemedicineConnectionModalProps {
  isOpen: boolean
  userName: string
  userRole: string
  onConnect: () => void
  onCancel: () => void
}

export function TelemedicineConnectionModal({
  isOpen,
  userName,
  userRole,
  onConnect,
  onCancel,
}: TelemedicineConnectionModalProps) {
  if (!isOpen) return null

  const roleLabel = userRole === 'doctor' ? 'Doctor' : userRole === 'nurse' ? 'Nurse' : 'Staff'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-[1.75rem] border border-slate-200 bg-white p-5 shadow-2xl sm:mx-4 sm:rounded-[1.75rem] sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8">
        <div className="mb-3 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-200" aria-hidden />
        </div>
        <div className="mb-5 text-center sm:mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF4FF] ring-4 ring-[#2E6EF3]/10 sm:mb-4 sm:h-16 sm:w-16">
            <svg className="h-7 w-7 text-[#2E6EF3] sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900 sm:text-2xl">Join telemedicine session</h2>
          <p className="text-sm text-slate-500">You are logged in as</p>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-[#f5f7fb] p-3 sm:p-4">
            <p className="break-words text-base font-semibold text-slate-900 sm:text-lg">{userName}</p>
            <p className="mt-1 text-sm font-medium text-[#2E6EF3]">{roleLabel}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConnect}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#2E6EF3] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#256ae8]"
          >
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
