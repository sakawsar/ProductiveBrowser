import { createRoot } from 'react-dom/client'
import { Blocked } from './Blocked'
import { Extensions } from './Extensions'
import { NewTab } from './NewTab'
import { Settings } from './Settings'
import '../theme.css'
import './pages.css'

const pages: Record<string, { title: string; Page: () => React.JSX.Element | null }> = {
  newtab: { title: 'New Tab', Page: NewTab },
  blocked: { title: 'Blocked', Page: Blocked },
  settings: { title: 'Limits', Page: Settings },
  extensions: { title: 'Extensions', Page: Extensions }
}
const { title, Page } = pages[location.host] ?? pages.newtab
document.title = title
createRoot(document.getElementById('root')!).render(<Page />)
