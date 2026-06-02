'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const pageTransition = {
  duration: 0.15,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

// Pages that use full-screen fixed positioning — transitions break them
const FULLSCREEN_PAGES = ['/stories/create', '/auth/']

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Skip animation for fullscreen pages or reduced motion
  const isFullscreen = FULLSCREEN_PAGES.some(p => pathname.startsWith(p))
  if (reducedMotion || isFullscreen) return <>{children}</>

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
