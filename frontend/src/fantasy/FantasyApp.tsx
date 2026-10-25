import './styles/index.css'
import App from './App'

/**
 * The fantasy copilot, mounted inside the Courtside shell at /fantasy. `.fantasy-root` is the
 * scoping container: every rule in ./styles is prefixed with it at build time (see vite.config.ts)
 * and Tailwind is reverted inside it (see ../index.css). The hash router keeps `?session=<id>#/draft`.
 * The document title follows the shell breadcrumb (AppShell → useDocumentTitle).
 */
export default function FantasyApp() {
  return (
    <div className="fantasy-root">
      <App />
    </div>
  )
}
