import type { ReactNode } from 'react'
import { maintenanceTickerTopInsetClassName } from '@/lib/maintenance-ticker'

/** Full-screen telemedicine shell — no app chrome, optimized for mobile viewport. */
export default function VideoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`fixed inset-0 overflow-hidden overscroll-none bg-[#EEF4FF] supports-[height:100dvh]:min-h-[100dvh] min-h-screen ${maintenanceTickerTopInsetClassName()}`}
    >
      {children}
    </div>
  )
}
