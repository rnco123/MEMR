/**
 * Landing hero illustration: an EMR window (patient chart, vitals, SOAP note)
 * with floating video-visit, appointment and prescription cards. Pure SVG in brand
 * colours — no text, so it works in every language — and it scales with its container.
 */
export function HeroIllustration({ className = '' }: { className?: string }) {
  const NAVY = '#0B2545'
  const BLUE = '#2E6EF3'
  const SKY = '#CFE6FC'
  const MIST = '#EAF4FE'
  const LINE = '#E2E8F0'

  return (
    <svg viewBox="0 0 600 520" className={className} role="img" aria-label="MyClinicMD patient chart with video visit, appointment and prescription">
      <style>{`
        .hi-float-a { animation: hi-float 6s ease-in-out infinite; }
        .hi-float-b { animation: hi-float 7s ease-in-out -2s infinite; }
        .hi-float-c { animation: hi-float 5.5s ease-in-out -1s infinite; }
        @keyframes hi-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @media (prefers-reduced-motion: reduce) {
          .hi-float-a, .hi-float-b, .hi-float-c { animation: none }
        }
      `}</style>
      <defs>
        <linearGradient id="hi-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DCEEFD" />
          <stop offset="1" stopColor="#B9DAF8" />
        </linearGradient>
        <filter id="hi-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor={NAVY} floodOpacity=".16" />
        </filter>
        <filter id="hi-shadow-sm" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor={NAVY} floodOpacity=".18" />
        </filter>
      </defs>

      {/* Backdrop */}
      <circle cx="320" cy="250" r="230" fill="url(#hi-bg)" />
      <circle cx="520" cy="80" r="34" fill={SKY} />
      <circle cx="70" cy="420" r="22" fill={SKY} />
      <g fill={BLUE} opacity=".35">
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2, 3].map((c) => <circle key={`${r}-${c}`} cx={60 + c * 16} cy={70 + r * 16} r="2.5" />)
        )}
      </g>
      <path d="M548 300h20M558 290v20" stroke={BLUE} strokeWidth="5" strokeLinecap="round" opacity=".5" />

      {/* Main EMR window */}
      <g filter="url(#hi-shadow)">
        <rect x="110" y="90" width="400" height="300" rx="20" fill="#fff" />
      </g>
      <rect x="110" y="90" width="400" height="38" rx="20" fill={NAVY} />
      <rect x="110" y="110" width="400" height="18" fill={NAVY} />
      <circle cx="134" cy="109" r="5" fill="#fff" opacity=".35" />
      <circle cx="150" cy="109" r="5" fill="#fff" opacity=".35" />
      <circle cx="166" cy="109" r="5" fill="#fff" opacity=".35" />
      <rect x="300" y="101" width="150" height="16" rx="8" fill="#fff" opacity=".14" />

      {/* Sidebar */}
      <rect x="110" y="128" width="78" height="262" fill={MIST} />
      <rect x="110" y="370" width="78" height="20" rx="0" fill={MIST} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x="124" y={150 + i * 34} width="50" height="22" rx="7" fill={i === 1 ? BLUE : '#fff'} opacity={i === 1 ? 1 : 0.9} />
          <rect x="132" y={159 + i * 34} width={i === 1 ? 26 : 22} height="4" rx="2" fill={i === 1 ? '#fff' : '#CBD5E1'} />
        </g>
      ))}

      {/* Patient header */}
      <circle cx="226" cy="164" r="20" fill={SKY} />
      <circle cx="226" cy="158" r="7" fill={NAVY} opacity=".85" />
      <path d="M212 177a14 10 0 0 1 28 0" fill={NAVY} opacity=".85" />
      <rect x="256" y="152" width="96" height="9" rx="4.5" fill={NAVY} />
      <rect x="256" y="168" width="62" height="7" rx="3.5" fill="#CBD5E1" />
      <rect x="430" y="150" width="62" height="26" rx="8" fill="none" stroke={NAVY} strokeWidth="2" />
      <rect x="443" y="161" width="36" height="4" rx="2" fill={NAVY} />

      {/* Vitals tiles */}
      {[
        { x: 206, c: '#FDE68A', i: 'M0 4h4l2-4 3 8 2-4h3' },
        { x: 278, c: '#BBF7D0', i: 'M7 0a4 4 0 0 1 0 8 4 4 0 0 1 0-8z' },
        { x: 350, c: '#DDD6FE', i: 'M5 0v8M1 4h8' },
        { x: 422, c: '#FBCFE8', i: 'M0 8L7 0l7 8' },
      ].map((v, idx) => (
        <g key={idx}>
          <rect x={v.x} y="198" width="64" height="54" rx="12" fill={MIST} />
          <circle cx={v.x + 16} cy="215" r="9" fill={v.c} />
          <path d={v.i} transform={`translate(${v.x + 9} 211)`} stroke={NAVY} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x={v.x + 10} y="232" width="38" height="8" rx="4" fill={NAVY} />
        </g>
      ))}

      {/* SOAP note */}
      <rect x="206" y="266" width="280" height="104" rx="14" fill="#fff" stroke={LINE} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="220" y={278 + i * 22} width="18" height="16" rx="5" fill={MIST} />
          <rect x="226" y={284 + i * 22} width="6" height="4" rx="2" fill={BLUE} />
          <rect x="246" y={281 + i * 22} width={[200, 170, 186, 150][i]} height="5" rx="2.5" fill="#CBD5E1" />
          <rect x="246" y={290 + i * 22} width={[140, 120, 96, 110][i]} height="4" rx="2" fill={LINE} />
        </g>
      ))}

      {/* Video visit card */}
      <g className="hi-float-a">
        <g filter="url(#hi-shadow-sm)">
          <rect x="22" y="250" width="160" height="128" rx="16" fill={NAVY} />
        </g>
        <rect x="34" y="262" width="136" height="80" rx="10" fill="#13315C" />
        <circle cx="102" cy="292" r="16" fill={SKY} />
        <path d="M80 330a22 16 0 0 1 44 0" fill={SKY} />
        <rect x="130" y="270" width="32" height="24" rx="6" fill={BLUE} />
        <circle cx="146" cy="280" r="5" fill="#fff" opacity=".9" />
        <circle cx="66" cy="360" r="9" fill="#EF4444" />
        <path d="M62 360h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="94" cy="360" r="9" fill="#fff" opacity=".2" />
        <circle cx="122" cy="360" r="9" fill="#fff" opacity=".2" />
        <rect x="138" y="355" width="24" height="10" rx="5" fill="#22C55E" />
      </g>

      {/* Appointment card */}
      <g className="hi-float-b">
        <g filter="url(#hi-shadow-sm)">
          <rect x="430" y="28" width="150" height="86" rx="16" fill="#fff" />
        </g>
        <rect x="444" y="42" width="34" height="34" rx="10" fill={SKY} />
        <rect x="451" y="52" width="20" height="17" rx="3" fill="none" stroke={NAVY} strokeWidth="2" />
        <path d="M451 57h20M456 48v6M466 48v6" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
        <rect x="488" y="47" width="72" height="8" rx="4" fill={NAVY} />
        <rect x="488" y="62" width="48" height="6" rx="3" fill="#CBD5E1" />
        <rect x="444" y="88" width="92" height="12" rx="6" fill={MIST} />
        <circle cx="556" cy="94" r="10" fill="#22C55E" />
        <path d="M551 94l3.5 3.5L561 91" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Prescription chip */}
      <g className="hi-float-c">
        <g filter="url(#hi-shadow-sm)">
          <rect x="386" y="414" width="176" height="56" rx="28" fill="#fff" />
        </g>
        <circle cx="414" cy="442" r="18" fill="#DCFCE7" />
        <g transform="rotate(-45 414 442)">
          <rect x="403" y="436" width="22" height="12" rx="6" fill="none" stroke="#16A34A" strokeWidth="2" />
          <path d="M414 436v12" stroke="#16A34A" strokeWidth="2" />
        </g>
        <rect x="442" y="432" width="84" height="8" rx="4" fill={NAVY} />
        <rect x="442" y="446" width="56" height="6" rx="3" fill="#CBD5E1" />
        <circle cx="540" cy="442" r="8" fill={BLUE} />
        <path d="M536.5 442l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
