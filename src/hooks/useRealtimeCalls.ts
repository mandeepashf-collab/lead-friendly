import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type CallUpdate = {
  id: string;
  status: string;
  duration_seconds?: number;
  disposition?: string;
  recording_url?: string;
};

/**
 * Subscribe to live updates for all calls linked to a contact.
 * When Telnyx fires a status webhook and our /api/voice/status route
 * updates the DB, this hook pushes the change to `onUpdate` instantly
 * — no polling or page refresh needed.
 */
export function useRealtimeCalls(
  contactId: string | null,
  onUpdate: (call: CallUpdate) => void
) {
  useEffect(() => {
    if (!contactId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`calls:contact:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            onUpdate(payload.new as CallUpdate);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId, onUpdate]);
}
