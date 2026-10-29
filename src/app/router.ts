import { useEffect, useState } from 'react'

export function normalizePath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, '')
  return path || '/app/dashboard'
}

export function usePathname() {
  const [location, setLocation] = useState(() => ({ pathname: normalizePath(window.location.pathname), search: window.location.search }))

  useEffect(() => {
    const handlePopState = () => setLocation({ pathname: normalizePath(window.location.pathname), search: window.location.search })
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(path: string) {
    const url = new URL(path, window.location.origin)
    const nextPath = normalizePath(url.pathname)
    if (nextPath === location.pathname && url.search === location.search) return
    window.history.pushState({}, '', `${nextPath}${url.search}${url.hash}`)
    setLocation({ pathname: nextPath, search: url.search })
  }

  return { pathname: location.pathname, search: location.search, navigate }
}
