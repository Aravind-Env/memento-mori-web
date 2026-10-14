import { useEffect, useRef, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export interface ElementSize {
  width: number
  height: number
}

/** Tracks an element's content box both dimensions via ResizeObserver. */
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  ElementSize,
] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** Runs a callback on every change of the local calendar day (at midnight). */
export function useMidnightRefresh(callback: () => void): void {
  const cb = useRef(callback)
  cb.current = callback
  useEffect(() => {
    let timer: number
    const schedule = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2)
      timer = window.setTimeout(() => {
        cb.current()
        schedule()
      }, next.getTime() - now.getTime())
    }
    schedule()
    const onVisible = () => {
      if (document.visibilityState === 'visible') cb.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}
