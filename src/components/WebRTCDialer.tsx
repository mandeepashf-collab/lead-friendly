'use client'

// SIP/WebRTC auto-connect removed — was causing "Connection failed — check SIP
// credentials" toast on every page load.
//
// Outbound calling now goes through the REST API: POST /api/calls/trigger
// which uses the Telnyx programmable voice API (no SIP softphone required).
//
// dialerEvents and useDialer are kept for backwards compatibility while the
// contact detail page is being migrated to InitiateCallModal (Task 7).

interface CallRequest {
  phoneNumber: string
  contactName: string
  contactId?: string
}

// Event bus — kept so existing call sites don't break during migration
export const dialerEvents = {
  listeners: [] as ((req: CallRequest) => void)[],
  call(req: CallRequest) {
    this.listeners.forEach(fn => fn(req))
  },
  onCall(fn: (req: CallRequest) => void) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }
}

// No-op component — renders nothing, makes no connections
export function WebRTCDialer() {
  return null
}

// Convenience hook kept for backwards compatibility
export function useDialer() {
  return {
    call: (phoneNumber: string, contactName: string, contactId?: string) => {
      dialerEvents.call({ phoneNumber, contactName, contactId })
    }
  }
}
