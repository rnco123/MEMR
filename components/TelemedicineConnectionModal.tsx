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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-slate-800 border border-white/20 rounded-t-2xl sm:rounded-2xl p-5 sm:p-8 max-w-md w-full sm:mx-4 shadow-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-8">
        <div className="sm:hidden flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-white/20" aria-hidden />
        </div>
        <div className="text-center mb-5 sm:mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Join Telemedicine Session</h2>
          <p className="text-gray-300 text-sm">You are logged in as</p>
          <div className="mt-3 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-base sm:text-lg font-semibold text-white break-words">{userName}</p>
            <p className="text-sm text-blue-300 mt-1">{roleLabel}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={onConnect}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 min-h-[44px]"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
