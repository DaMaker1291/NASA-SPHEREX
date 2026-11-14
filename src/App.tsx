import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import { Footer } from './components/Footer'
import { Guide } from './pages/Guide'
import { Tool } from './pages/Tool'

function ScrollManager() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    const target = hash || window.location.hash
    if (!target) {
      window.scrollTo(0, 0)
      return
    }
    const id = decodeURIComponent(target.slice(1))
    let timer = 0
    let attempts = 0
    const reveal = () => {
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'instant', block: 'start' })
        return
      }
      attempts += 1
      if (attempts < 24) timer = window.setTimeout(reveal, 100)
    }
    timer = window.setTimeout(reveal, 80)
    return () => window.clearTimeout(timer)
  }, [pathname, hash, key])

  return null
}

function Pages() {
  const location = useLocation()

  return (
    <main id="main" className="flex-1">
      <Routes location={location}>
        <Route index element={<Tool />} />
        <Route path="guide" element={<Guide />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  )
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScrollManager />
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-violet px-5 py-3 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <div id="top" className="flex min-h-svh flex-col">
          <Pages />
          <Footer />
        </div>
      </BrowserRouter>
    </MotionConfig>
  )
}
