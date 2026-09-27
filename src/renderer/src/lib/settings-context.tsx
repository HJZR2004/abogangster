import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { PublicSettings } from '@shared/types'
import { Spinner } from '../components/ui'
import { invoke, useLoad } from './api'

interface SettingsContextValue {
  settings: PublicSettings
  reload: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings fuera de SettingsProvider')
  return ctx
}

/** Loads settings once and applies the chosen interface font size. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, reload, error } = useLoad(() => invoke('settings:get'), [])

  useEffect(() => {
    if (data) document.documentElement.style.fontSize = `${data.fontSize}px`
  }, [data])

  if (error) return <p className="p-8 text-lg text-bad-700">No se pudo cargar la configuración: {error}</p>
  if (!data) return <Spinner label="Abriendo Abogangster…" />
  return <SettingsContext.Provider value={{ settings: data, reload }}>{children}</SettingsContext.Provider>
}

/** True when a chat model has been chosen (the AI can be used). */
export function isAiConfigured(s: PublicSettings): boolean {
  return s.chat.model.trim() !== ''
}
