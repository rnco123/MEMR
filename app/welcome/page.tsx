import { redirect } from 'next/navigation'

/** The landing page lives at `/` now; keep old /welcome links working. */
export default function WelcomePage() {
  redirect('/')
}
