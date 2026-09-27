import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import type { EventChannel, EventContract, InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'

/** Typed call to the main process. Rejects with an Error whose message is user-facing Spanish. */
export function invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>> {
  return window.api.invoke(channel, ...args)
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Subscribes to a main-process event for the lifetime of the component. */
export function useEvent<K extends EventChannel>(channel: K, handler: (payload: EventContract[K]) => void): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => window.api.on(channel, (payload) => ref.current(payload)), [channel])
}

export interface LoadState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  setData: (value: T) => void
}

/** Loads data on mount / when deps change; exposes `reload` for refreshes after events. */
export function useLoad<T>(loader: () => Promise<T>, deps: DependencyList): LoadState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const generation = useRef(0)

  const reload = useCallback(async () => {
    const current = ++generation.current
    try {
      const value = await loaderRef.current()
      if (current === generation.current) {
        setData(value)
        setError(null)
      }
    } catch (err) {
      if (current === generation.current) setError(errorText(err))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, deps)

  return { data, error, loading, reload, setData }
}
