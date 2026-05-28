import { useEffect, useState } from 'react'
import {
  getSyncState,
  subscribeSync,
  syncNow,
  type SyncState,
} from '../lib/syncEngine'

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState())
  useEffect(() => subscribeSync(setState), [])
  return state
}

export { syncNow }
