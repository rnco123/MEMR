'use client'

import { PASSWORD_CHECKS } from '@/lib/security/password-checks'

type PasswordStrengthMeterProps = {
  password: string
  t: (key: string) => string
  className?: string
}

export function PasswordStrengthMeter({ password, t, className = '' }: PasswordStrengthMeterProps) {
  if (!password) return null

  const passed = PASSWORD_CHECKS.filter(({ test }) => test(password)).length

  return (
    <div className={className}>
      <div className="mb-2 flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < passed
                ? passed >= 4
                  ? 'bg-emerald-500'
                  : passed >= 3
                    ? 'bg-amber-500'
                    : 'bg-orange-400'
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PASSWORD_CHECKS.map(({ labelKey, test }) => {
          const ok = test(password)
          return (
            <span
              key={labelKey}
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors ${
                ok ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {ok ? '✓ ' : ''}
              {t(labelKey)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
