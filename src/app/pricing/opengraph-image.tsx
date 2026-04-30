import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Lead Friendly pricing — Starter, Pro, Agency'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: '#a5b4fc',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 24,
          }}
        >
          Lead Friendly · Pricing
        </div>

        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#f8fafc',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
          }}
        >
          Simple, transparent pricing
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 28,
            color: '#94a3b8',
          }}
        >
          AI-powered sales calling. 14-day free trial. No card required.
        </div>

        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 60,
          }}
        >
          {[
            { name: 'Starter', price: '$79' },
            { name: 'Pro', price: '$199' },
            { name: 'Agency', price: '$399' },
          ].map((plan) => (
            <div
              key={plan.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '24px 32px',
                borderRadius: 16,
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
              }}
            >
              <span style={{ fontSize: 20, color: '#cbd5e1' }}>{plan.name}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
                {plan.price}
                <span style={{ fontSize: 18, color: '#94a3b8', marginLeft: 4 }}>/mo</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
