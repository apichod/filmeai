'use client'

import { useEffect, useRef, useState } from 'react'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'compact' | 'flexible'
    }
  ) => string
  reset?: (widgetId?: string) => void
  remove?: (widgetId?: string) => void
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi }

type Props = {
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
  compact?: boolean
}

const SCRIPT_ID = 'cf-turnstile-script'

export default function TurnstileField({ onVerify, onExpire, className, compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if ((window as TurnstileWindow).turnstile) {
      setScriptReady(true)
      return
    }

    if (existing) {
      existing.addEventListener('load', () => setScriptReady(true), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => setScriptReady(true)
    document.head.appendChild(script)
  }, [siteKey])

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || widgetIdRef.current) return

    const turnstile = (window as TurnstileWindow).turnstile
    if (!turnstile) return

    widgetIdRef.current = turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'light',
      size: compact ? 'compact' : 'normal',
      callback: onVerify,
      'expired-callback': () => {
        onVerify('')
        onExpire?.()
      },
      'error-callback': () => {
        onVerify('')
        onExpire?.()
      },
    })

    return () => {
      if (widgetIdRef.current) turnstile.remove?.(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [compact, onExpire, onVerify, scriptReady, siteKey])

  if (!siteKey) return null

  return <div ref={containerRef} className={className} />
}
