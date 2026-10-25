import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { SiteBadge, TabInfo } from '../../shared/types'
import '../theme.css'
import './toolbar.css'

const fmt = (sec: number): string => {
  const m = Math.floor(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec % 60).padStart(2, '0')}`
}

/** Shows pb:// URLs as-is and web URLs without the noise of a trailing slash. */
const display = (url: string): string => (url === 'pb://newtab/' ? '' : url)

function Toolbar() {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [badge, setBadge] = useState<SiteBadge | null>(null)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const addressRef = useRef<HTMLInputElement>(null)
  const active = tabs.find((t) => t.active)

  useEffect(() => {
    window.browserApi.onTabs(setTabs)
    window.browserApi.onStatus(setBadge)
    window.browserApi.onFocusAddress(() => addressRef.current?.select())
  }, [])
  useEffect(() => {
    if (!editing) setAddress(display(active?.url ?? ''))
  }, [active?.url, active?.id, editing])

  const level = badge?.remainingSec === undefined ? '' : badge.remainingSec <= 60 ? 'bad' : badge.remainingSec <= 300 ? 'warn' : 'ok'

  return (
    <div className="toolbar">
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={'tab' + (t.active ? ' active' : '')}
            title={t.title}
            onMouseDown={(e) => (e.button === 1 ? window.browserApi.closeTab(t.id) : window.browserApi.activate(t.id))}
          >
            {t.loading ? <span className="spinner" /> : t.favicon ? <img src={t.favicon} alt="" /> : <span className="dot" />}
            <span className="title">{t.title}</span>
            <button
              className="close"
              aria-label="Close tab"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => window.browserApi.closeTab(t.id)}
            >
              ×
            </button>
          </div>
        ))}
        <button className="new" aria-label="New tab" onClick={() => window.browserApi.newTab()}>
          +
        </button>
      </div>
      <div className="nav">
        <button aria-label="Back" disabled={!active?.canGoBack} onClick={() => window.browserApi.back()}>
          ←
        </button>
        <button aria-label="Forward" disabled={!active?.canGoForward} onClick={() => window.browserApi.forward()}>
          →
        </button>
        <button aria-label="Reload" onClick={() => window.browserApi.reload()}>
          ⟳
        </button>
        <form
          className="address"
          onSubmit={(e) => {
            e.preventDefault()
            if (address.trim()) window.browserApi.go(address)
            ;(document.activeElement as HTMLElement)?.blur()
          }}
        >
          <input
            ref={addressRef}
            value={address}
            placeholder="Search or enter address"
            spellCheck={false}
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
          />
        </form>
        {badge && (
          <span className={'badge ' + (badge.allowed ? level : 'bad')} title={`${badge.name} time left today`}>
            {badge.name} · {badge.allowed && badge.remainingSec !== undefined ? fmt(badge.remainingSec) : 'blocked'}
          </span>
        )}
        <browser-action-list alignment="bottom right" />
        <button aria-label="Extensions" title="Extensions" onClick={() => window.browserApi.extensions()}>
          🧩
        </button>
        <button aria-label="Limits and settings" title="Limits and settings" onClick={() => window.browserApi.settings()}>
          ⏱
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Toolbar />)
