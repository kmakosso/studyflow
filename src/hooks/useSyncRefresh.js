/**
 * useSyncRefresh — subscribe to cloud-pull events.
 *
 * When the sync engine finishes pulling data from the cloud it dispatches
 * 'studyflow:data-sync' on the window. Hooks call this helper so their
 * local React state is refreshed immediately without a full page reload.
 *
 * Usage:
 *   const load = useCallback(async () => { ... }, []);
 *   useSyncRefresh(load);
 */
import { useEffect } from 'react';

export const SYNC_EVENT = 'studyflow:data-sync';

export function useSyncRefresh(callback) {
  useEffect(() => {
    window.addEventListener(SYNC_EVENT, callback);
    return () => window.removeEventListener(SYNC_EVENT, callback);
  }, [callback]);
}
