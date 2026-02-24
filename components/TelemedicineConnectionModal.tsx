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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Join Telemedicine Session</h2>
          <p className="text-gray-300 text-sm">
            You are logged in as
          </p>
          <div className="mt-3 p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-lg font-semibold text-white">{userName}</p>
            <p className="text-sm text-blue-300 mt-1">{roleLabel}</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConnect}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
