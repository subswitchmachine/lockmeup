import { createContext } from 'react'

/**
 * Pools currently in scope for image-drawing components (notably `Slideshow`).
 * Empty/undefined = draw from every available pool. App / TaskRunner provide
 * this so the runtime slideshow respects the lock's pool selection without
 * threading the list through every task component.
 */
export const PoolsContext = createContext<string[] | undefined>(undefined)

export const PoolsProvider = PoolsContext.Provider
