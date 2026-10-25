import { useEffect } from 'react'
import './styles/index.css'
import App from './App'

const TITLE = 'Courtside — Fantasy'

/**
 * The fantasy copilot, mounted inside the Courtside shell at /fantasy. `.fantasy-root` is the
 * scoping container: every rule in ./styles is prefixed with it at build time (see vite.config.ts)
 * and Tailwind is reverted inside it (see ../index.css). The hash router keeps `?session=<id>#/draft`.
 */
export default function FantasyApp() {
  useEffect(() => {
    const previous = document.title
    document.title = TITLE
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <div className="fantasy-root">
      <App />
    </div>
  )
}
