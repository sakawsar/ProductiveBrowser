import { UsageBar, useServiceState } from './common'

export function NewTab() {
  const state = useServiceState()
  return (
    <main className="page narrow">
      <h1>Productive Browser</h1>
      {!state ? null : !state.configured ? (
        <section className="card">
          <p>No limits are set yet. Choose which sites to limit and for how long.</p>
          <a className="button primary" href="pb://settings/">
            Set up limits
          </a>
        </section>
      ) : (
        <section className="card">
          <h2>Today</h2>
          {state.sites.map((s) => (
            <UsageBar key={s.id} site={s} />
          ))}
          <p className="muted small">
            <a href="pb://settings/">Edit limits</a>
          </p>
        </section>
      )}
    </main>
  )
}
