import { duration, reasonText, useNow, useServiceState, when } from './common'

export function Blocked() {
  const state = useServiceState()
  const now = useNow()
  const params = new URLSearchParams(location.search)
  const site = state?.sites.find((s) => s.id === params.get('site'))
  const original = params.get('url')
  if (!state || !site) return null

  return (
    <main className="page narrow center">
      <div className="big-icon">⏳</div>
      {site.allowed ? (
        <>
          <h1>{site.name} is available again</h1>
          {original && (
            <a className="button primary" href={original}>
              Continue to {site.name}
            </a>
          )}
        </>
      ) : (
        <>
          <h1>{site.name} is blocked</h1>
          <p>{reasonText(site)}</p>
          {site.nextOpenAt ? (
            <p className="muted">
              Opens {when(site.nextOpenAt)} · in {duration(Date.parse(site.nextOpenAt) - now)}
            </p>
          ) : (
            site.reason !== 'offline' && <p className="muted">It isn't scheduled to open with the current rules.</p>
          )}
        </>
      )}
    </main>
  )
}
