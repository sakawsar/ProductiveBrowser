import { useEffect, useState } from 'react'
import type { ExtensionInfo } from '../../shared/types'

export function Extensions() {
  const [list, setList] = useState<ExtensionInfo[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.pb.listExtensions().then(setList)
  }, [])

  const remove = async (ext: ExtensionInfo): Promise<void> => {
    setError('')
    try {
      setList(await window.pb.removeExtension(ext.id))
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  return (
    <main className="page narrow">
      <h1>Extensions</h1>
      <p className="muted">
        Install Chrome extensions from the{' '}
        <a href="https://chromewebstore.google.com/">Chrome Web Store</a>. Extensions follow the same time limits as everything else.
      </p>
      {list && (
        <section className="card">
          {list.length === 0 ? (
            <p className="muted">No extensions installed yet.</p>
          ) : (
            list.map((ext) => (
              <div key={ext.id} className="ext-row">
                <div>
                  <strong>{ext.name}</strong>
                  <div className="muted small">Version {ext.version}</div>
                </div>
                <button type="button" className="button" onClick={() => void remove(ext)}>
                  Remove
                </button>
              </div>
            ))
          )}
          {error && <p className="bad">{error}</p>}
        </section>
      )}
    </main>
  )
}
