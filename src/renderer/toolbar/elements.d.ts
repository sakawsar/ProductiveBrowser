import 'react'

// Custom element defined by injectBrowserAction() in the toolbar preload.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': { alignment?: string; partition?: string; tab?: string }
    }
  }
}
