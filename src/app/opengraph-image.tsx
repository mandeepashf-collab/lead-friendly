import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Lead Friendly — AI-powered sales calling, built into your CRM'
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
        {/* Sparkles icon mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: 20,
            background: '#6366f1',
            marginBottom: 40,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
            <path d="M20 2v4" />
            <path d="M22 4h-4" />
            <circle cx="4" cy="20" r="2" />
          </svg>
        </div>

        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#f8fafc',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>AI sales calling,</span>
          <span style={{ color: '#a5b4fc' }}>built into your CRM.</span>
        </div>

        <div
          style={{
            marginTop: 32,
            fontSize: 28,
            color: '#94a3b8',
            display: 'flex',
          }}
        >
          No Retell. No Twilio. Everything included.
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 80,
            fontSize: 24,
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 600 }}>leadfriendly.com</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
