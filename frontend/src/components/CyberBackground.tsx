import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { resolveCalm, useCalmOverride } from '../theme/calm'
import { useTheme } from '../theme/theme'

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ01234567890ABCDEF<>/#$%'

/** Fondo cyber (lluvia de código y suelo en perspectiva). Solo en el tema oscuro. */
export function CyberBackground() {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const calm = resolveCalm(useCalmOverride(), pathname)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dark = theme === 'dark'

  useEffect(() => {
    document.documentElement.toggleAttribute('data-calm', calm)
  }, [calm])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    // En modo sereno o con "reducir movimiento" se dibuja un solo fotograma estático.
    const still = calm || matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0
    let H = 0
    let drops: number[] = []
    let raf = 0

    const size = () => {
      W = c.width = innerWidth
      H = c.height = innerHeight
      drops = Array.from({ length: Math.ceil(W / 18) }, () => Math.random() * (still ? 60 : -60))
      if (still) frame()
    }
    const frame = () => {
      ctx.fillStyle = still ? '#03050c' : 'rgba(3,5,12,.16)'
      ctx.fillRect(0, 0, W, H)
      ctx.font = '15px "Share Tech Mono",monospace'
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * 18
        ctx.fillStyle = Math.random() < 0.04 ? '#ff2e88' : '#00c4d4'
        ctx.globalAlpha = 0.55
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * 18, y)
        if (y > H && Math.random() > 0.975) drops[i] = Math.random() * -20
        drops[i] += 0.45
      }
      ctx.globalAlpha = 1
      const hz = H * 0.74
      const t = still ? 0 : (performance.now() / 1000) % 1
      ctx.strokeStyle = 'rgba(122,61,240,.55)'
      ctx.beginPath()
      for (let i = -14; i <= 14; i++) {
        ctx.moveTo(W / 2 + i * 12, hz)
        ctx.lineTo(W / 2 + (i * W) / 9, H)
      }
      ctx.stroke()
      for (let j = 0; j < 9; j++) {
        const y = hz + (H - hz) * ((j + t) / 9) ** 2
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
      if (!still) raf = requestAnimationFrame(frame)
    }

    size()
    if (!still) frame()
    addEventListener('resize', size)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', size)
    }
  }, [calm, dark])

  return dark ? <canvas id="cy-bg" ref={canvas} aria-hidden="true" /> : null
}
