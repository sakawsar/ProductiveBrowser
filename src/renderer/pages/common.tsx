import { useEffect, useState } from 'react'
import type { ServiceState, SiteStatus } from '../../shared/types'

export function useServiceState(): ServiceState | null {
  const [state, setState] = useState<ServiceState | null>(null)
  useEffect(() => {
    void window.pb.getState().then(setState)
    window.pb.onState(setState)
  }, [])
  return state
}

/** Re-renders every second, for countdowns. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

export const minutes = (sec: number): string => `${Math.floor(sec / 60)} min`

export const when = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function reasonText(s: SiteStatus): string {
  switch (s.reason) {
    case 'quota':
      return s.dailyMinutes === 0 ? "It's set to 0 minutes a day." : `You've used today's ${s.dailyMinutes} minute${s.dailyMinutes === 1 ? '' : 's'}.`
    case 'window':
      return "It's outside the hours you allowed."
    case 'strict':
      return 'The rules file was changed or deleted, so all listed sites are blocked for now.'
    case 'offline':
      return "The Productive Browser service isn't running, so listed sites stay blocked."
    default:
      return ''
  }
}

export function UsageBar({ site }: { site: SiteStatus }) {
  const total = site.dailyMinutes * 60
  const pct = total ? Math.min(100, (site.usedSec / total) * 100) : 100
  return (
    <div className="usage">
      <div className="usage-head">
        <strong>{site.name}</strong>
        <span className={site.allowed ? 'muted' : 'bad'}>
          {site.allowed ? `${minutes(site.usedSec)} of ${site.dailyMinutes} min` : 'Blocked'}
        </span>
      </div>
      <div className="bar">
        <div className={'fill' + (site.allowed ? '' : ' bad')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
