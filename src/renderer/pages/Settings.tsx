import { useEffect, useState } from 'react'
import { normalizeDomain } from '../../shared/domains'
import { FILTERS, filterRank } from '../../shared/filter'
import { PRESETS } from '../../shared/presets'
import type { Config, Site, TimeWindow } from '../../shared/types'
import { duration, useNow, useServiceState, when } from './common'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY = 86_400_000
type LockChoice = 'keep' | '1' | '7' | '30' | 'custom'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function WindowEditor({ w, onChange, onRemove }: { w: TimeWindow; onChange: (w: TimeWindow) => void; onRemove: () => void }) {
  const toggle = (d: number): void =>
    onChange({ ...w, days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })
  return (
    <div className="window-row">
      <div className="days">
        {DAY_LABELS.map((label, d) => (
          <button key={d} type="button" className={'chip' + (w.days.includes(d) ? ' on' : '')} aria-pressed={w.days.includes(d)} onClick={() => toggle(d)}>
            {label}
          </button>
        ))}
      </div>
      <input type="time" value={w.start} aria-label="From" onChange={(e) => onChange({ ...w, start: e.target.value })} />
      <span className="muted">to</span>
      <input type="time" value={w.end} aria-label="Until" onChange={(e) => onChange({ ...w, end: e.target.value })} />
      <button type="button" className="link" onClick={onRemove}>
        Remove
      </button>
    </div>
  )
}

function SiteEditor({ site, locked, onChange, onRemove }: { site: Site; locked: boolean; onChange: (s: Site) => void; onRemove: () => void }) {
  const [domains, setDomains] = useState(site.domains.join(', '))
  useEffect(() => setDomains(site.domains.join(', ')), [site.domains])
  const setWindow = (i: number, w: TimeWindow): void => onChange({ ...site, windows: site.windows.map((x, j) => (j === i ? w : x)) })
  return (
    <section className="card site">
      <div className="site-head">
        <input className="site-name" value={site.name} aria-label="Site name" onChange={(e) => onChange({ ...site, name: e.target.value })} />
        <button type="button" className="link" disabled={locked} title={locked ? "Sites can't be removed while locked" : undefined} onClick={onRemove}>
          Remove site
        </button>
      </div>
      <label className="field">
        <span>Domains (subdomains included)</span>
        <input
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          onBlur={() => onChange({ ...site, domains: [...new Set(domains.split(',').map(normalizeDomain).filter(Boolean))] })}
        />
      </label>
      <label className="field inline">
        <span>Minutes per day</span>
        <input
          type="number"
          min={0}
          max={1440}
          value={site.dailyMinutes}
          onChange={(e) => onChange({ ...site, dailyMinutes: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
        />
      </label>
      <div className="field">
        <span>Allowed hours</span>
        {site.windows.length === 0 && <p className="muted small">Any time of day. Add hours to allow it only at certain times.</p>}
        {site.windows.map((w, i) => (
          <WindowEditor key={i} w={w} onChange={(nw) => setWindow(i, nw)} onRemove={() => onChange({ ...site, windows: site.windows.filter((_, j) => j !== i) })} />
        ))}
        <button
          type="button"
          className="button"
          onClick={() => onChange({ ...site, windows: [...site.windows, { days: [1, 2, 3, 4, 5], start: '20:00', end: '21:00' }] })}
        >
          Add hours
        </button>
      </div>
    </section>
  )
}

export function Settings() {
  const state = useServiceState()
  const now = useNow()
  const [draft, setDraft] = useState<Config | null>(null)
  const [lock, setLock] = useState<LockChoice>('7')
  const [custom, setCustom] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Start editing from the saved rules, or the presets on first run.
  useEffect(() => {
    if (!state || draft) return
    setDraft(clone(state.config) ?? { version: 1, sites: clone(PRESETS), lockUntil: '', createdAt: '' })
    if (state.locked) setLock('keep')
  }, [state, draft])

  if (!state || !draft) return null
  const offset = Date.parse(state.now) - Date.now() // service time is the source of truth
  const trustedNow = now + offset
  const savedIds = new Set(state.config?.sites.map((s) => s.id) ?? [])
  const missingPresets = PRESETS.filter((p) => !draft.sites.some((s) => s.id === p.id))

  const lockUntil = (): number | null => {
    if (lock === 'keep') return state.config ? Date.parse(state.config.lockUntil) : null
    if (lock === 'custom') return custom ? new Date(custom).getTime() : null
    return trustedNow + Number(lock) * DAY
  }

  const updateSite = (i: number, s: Site): void => setDraft({ ...draft, sites: draft.sites.map((x, j) => (j === i ? s : x)) })

  const save = async (): Promise<void> => {
    const until = lockUntil()
    if (!until || Number.isNaN(until)) return setMessage({ ok: false, text: 'Pick when the lock ends.' })
    setSaving(true)
    setMessage(null)
    try {
      await window.pb.saveConfig({ ...draft, lockUntil: new Date(until).toISOString() })
      setConfirm('')
      setLock('keep')
      setMessage({ ok: true, text: `Saved. Rules are locked until ${when(new Date(until).toISOString())}.` })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <h1>Limits</h1>
      {state.strict ? (
        <div className="banner bad">
          The rules file was changed or deleted, so every listed site is blocked until {when(state.config!.lockUntil)}.
        </div>
      ) : state.locked ? (
        <div className="banner">
          🔒 Locked until <strong>{when(state.config!.lockUntil)}</strong> ({duration(Date.parse(state.config!.lockUntil) - trustedNow)} left). You can
          still make the rules stricter: fewer minutes, shorter hours, more sites, or a longer lock.
        </div>
      ) : (
        <p className="muted">
          Choose the sites to limit. When you save, the rules are encrypted and locked, so they can't be loosened until the lock ends.
        </p>
      )}

      {draft.sites.map((s, i) => (
        <SiteEditor
          key={s.id}
          site={s}
          locked={state.locked && savedIds.has(s.id)}
          onChange={(ns) => updateSite(i, ns)}
          onRemove={() => setDraft({ ...draft, sites: draft.sites.filter((_, j) => j !== i) })}
        />
      ))}

      <div className="add-site">
        {missingPresets.map((p) => (
          <button key={p.id} type="button" className="button" onClick={() => setDraft({ ...draft, sites: [...draft.sites, clone(p)] })}>
            + {p.name}
          </button>
        ))}
        <button
          type="button"
          className="button"
          onClick={() =>
            setDraft({ ...draft, sites: [...draft.sites, { id: `custom-${Date.now()}`, name: 'New site', domains: [], dailyMinutes: 15, windows: [] }] })
          }
        >
          + Custom site
        </button>
      </div>

      <section className="card">
        <h2>Content filter</h2>
        <p className="muted small">
          Filters every site through <a href="https://cleanbrowsing.org/">CleanBrowsing</a> DNS, in this browser and in Chrome, Edge, Brave and Firefox.
        </p>
        <div className="filter-options">
          {FILTERS.map((f) => {
            const tooLoose = state.locked && filterRank(f.id) < filterRank(state.config?.filter)
            return (
              <label key={f.id} className={'filter-option' + (tooLoose ? ' disabled' : '')}>
                <input
                  type="radio"
                  name="filter"
                  checked={(draft.filter ?? 'off') === f.id}
                  disabled={tooLoose}
                  onChange={() => setDraft({ ...draft, filter: f.id })}
                />
                <span>
                  <strong>{f.name}</strong>
                  <span className="muted small"> · {f.description}</span>
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="card">
        <h2>Lock</h2>
        <div className="lock-options">
          {state.locked && (
            <label>
              <input type="radio" checked={lock === 'keep'} onChange={() => setLock('keep')} /> Keep current lock
            </label>
          )}
          {(['1', '7', '30'] as const).map((d) => (
            <label key={d}>
              <input type="radio" checked={lock === d} onChange={() => setLock(d)} /> {d === '1' ? '1 day' : `${d} days`}
            </label>
          ))}
          <label>
            <input type="radio" checked={lock === 'custom'} onChange={() => setLock('custom')} /> Until
            <input type="datetime-local" value={custom} onFocus={() => setLock('custom')} onChange={(e) => setCustom(e.target.value)} />
          </label>
        </div>
        <label className="field inline">
          <span>
            Type <strong>LOCK</strong> to confirm
          </span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button type="button" className="button primary" disabled={confirm !== 'LOCK' || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save and lock'}
        </button>
        {message && <p className={message.ok ? 'ok' : 'bad'}>{message.text}</p>}
      </section>
    </main>
  )
}
