import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to live changes on the calls and contacts tables.
 * Use in the dashboard to refresh stat cards without a page reload.
 *
 * Requires realtime enabled on these tables in Supabase:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE calls;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
 */
export function useRealtimeDashboard(
  onCallChange: () => void,
  onContactChange: () => void
) {
  useEffect(() => {
    const supabase = createClient();

    const callsChannel = supabase
      .channel('dashboard:calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, onCallChange)
      .subscribe();

    const contactsChannel = supabase
      .channel('dashboard:contacts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, onContactChange)
      .subscribe();

    return () => {
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [onCallChange, onContactChange]);
}
