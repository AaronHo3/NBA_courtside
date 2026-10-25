import { useEffect } from 'react'

export const APP_TITLE = 'Courtside'

/** `document.title` for a page name: `Power rankings · Courtside`; no name gives the bare app title. */
export function documentTitle(page: string | null | undefined): string {
  return page ? `${page} · ${APP_TITLE}` : APP_TITLE
}

export function useDocumentTitle(page: string | null | undefined): void {
  const title = documentTitle(page)
  useEffect(() => {
    document.title = title
  }, [title])
}
