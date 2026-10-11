import { useSyncExternalStore } from 'react'
import {
  getCustomPoolsSnapshot,
  getPoolsSnapshot,
  subscribeImages,
} from '../lib/puzzleImages'

/**
 * Subscribe to the live image-pool lists. `pools` is every selectable pool
 * (bundled + user-supplied); `customPools` is just the user-supplied ones (so
 * the UI can offer to remove them). Both update when the user adds or removes
 * a folder of their own images.
 */
export function useImagePools(): { pools: string[]; customPools: string[] } {
  const pools = useSyncExternalStore(subscribeImages, getPoolsSnapshot, getPoolsSnapshot)
  const customPools = useSyncExternalStore(
    subscribeImages,
    getCustomPoolsSnapshot,
    getCustomPoolsSnapshot,
  )
  return { pools, customPools }
}
