import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { LinkData, LinkKind, NodeData } from './model'

/**
 * Motor del mapa: física (d3-force) + dibujo en <canvas> + interacción.
 * No depende de React: la página le pasa datos y recibe eventos (select/activate).
 *
 * Canvas en vez de SVG: con cientos de nodos y partículas animadas a 60 fps, dibujar
 * píxeles es mucho más barato que mantener cientos de elementos en el DOM.
 */

export interface SimNode extends SimulationNodeDatum, NodeData {}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string
  kind: LinkKind
  label: string
  source: SimNode | string
  target: SimNode | string
}

export interface MapColors {
  bg: string
  fg: string
  muted: string
  line: string
  accent: string
  accentSoft: string
  palette: string[]
  dark: boolean
}

export interface EngineEvents {
  select: (node: SimNode | null) => void
  activate: (node: SimNode) => void
}

interface View {
  x: number
  y: number
  k: number
}

type Pointer =
  | { mode: 'idle' }
  | { mode: 'pan'; sx: number; sy: number; start: View; moved: boolean }
  | { mode: 'drag'; node: SimNode; sx: number; sy: number; moved: boolean }

const MIN_K = 0.08
const MAX_K = 5
const LINK_DISTANCE: Record<LinkKind, number> = { schema: 190, member: 62, fk: 85, m2m: 95 }
const LINK_STRENGTH: Record<LinkKind, number> = { schema: 0.12, member: 0.5, fk: 0.3, m2m: 0.25 }

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function hash01(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return (Math.abs(h) % 1000) / 1000
}

const ends = (l: SimLink) => [l.source as SimNode, l.target as SimNode] as const

export class MapEngine {
  particles = true

  private readonly ctx: CanvasRenderingContext2D
  private readonly sim: Simulation<SimNode, SimLink>
  private readonly observer: ResizeObserver
  private nodes: SimNode[] = []
  private links: SimLink[] = []
  private byId = new Map<string, SimNode>()
  private adjacency = new Map<string, Set<string>>()
  private view: View = { x: 0, y: 0, k: 1 }
  private flight: { from: View; to: View; start: number; duration: number } | null = null
  private pointer: Pointer = { mode: 'idle' }
  private hoverId: string | null = null
  private selectedId: string | null = null
  private stars: { x: number; y: number; r: number; phase: number }[] = []
  private dpr = 1
  private width = 0
  private height = 0
  private raf = 0
  private dirty = true

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: EngineEvents,
    private colors: MapColors,
  ) {
    this.ctx = canvas.getContext('2d')!
    this.sim = forceSimulation<SimNode, SimLink>([])
      .force(
        'link',
        forceLink<SimNode, SimLink>([])
          .id((d) => d.id)
          .distance((l) => LINK_DISTANCE[l.kind])
          .strength((l) => LINK_STRENGTH[l.kind]),
      )
      .force(
        'charge',
        forceManyBody<SimNode>()
          .strength((n) => (n.kind === 'table' ? -700 : -120))
          .distanceMax(700),
      )
      .force(
        'collide',
        forceCollide<SimNode>((n) => n.radius + (n.kind === 'table' ? 14 : 7)),
      )
      .force('x', forceX<SimNode>(0).strength(0.03))
      .force('y', forceY<SimNode>(0).strength(0.03))
      .alphaDecay(0.025)
      .stop() // la simulación avanza en nuestro propio bucle de animación

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    this.bindEvents()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.sim.stop()
    this.unbind()
  }

  // ------------------------------------------------------------------ datos

  setData(nodes: NodeData[], links: LinkData[]) {
    const firstLoad = this.nodes.length === 0
    const next = nodes.map((d) => {
      const existing = this.byId.get(d.id)
      if (existing) {
        existing.label = d.label
        existing.radius = d.radius
        existing.expanded = d.expanded
        existing.colorIndex = d.colorIndex
        return existing
      }
      const near = d.spawnNear ? this.byId.get(d.spawnNear) : undefined
      const angle = Math.random() * Math.PI * 2
      const dist = near ? near.radius + 18 + Math.random() * 26 : 150 + Math.random() * 250
      return {
        ...d,
        x: (near?.x ?? 0) + Math.cos(angle) * dist,
        y: (near?.y ?? 0) + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
      } satisfies SimNode
    })
    this.nodes = next
    this.byId = new Map(next.map((n) => [n.id, n]))
    this.links = links
      .filter((l) => this.byId.has(l.source) && this.byId.has(l.target))
      .map((l) => ({ ...l }))
    this.adjacency = new Map(next.map((n) => [n.id, new Set<string>()]))
    for (const l of this.links) {
      this.adjacency.get(l.source as string)?.add(l.target as string)
      this.adjacency.get(l.target as string)?.add(l.source as string)
    }
    if (this.selectedId && !this.byId.has(this.selectedId)) this.selectedId = null
    if (this.hoverId && !this.byId.has(this.hoverId)) this.hoverId = null

    this.sim.nodes(this.nodes)
    ;(this.sim.force('link') as ForceLink<SimNode, SimLink>).links(this.links)
    if (firstLoad) {
      // Pre-cálculo del esqueleto para no empezar con una explosión en pantalla.
      this.sim.alpha(1)
      for (let i = 0; i < 180; i++) this.sim.tick()
      this.fit(false)
    }
    this.sim.alpha(Math.max(this.sim.alpha(), firstLoad ? 0.1 : 0.45))
    this.dirty = true
  }

  setSelected(id: string | null) {
    this.selectedId = id
    this.dirty = true
  }

  setColors(colors: MapColors) {
    this.colors = colors
    this.dirty = true
  }

  setParticles(on: boolean) {
    this.particles = on
    this.dirty = true
  }

  private colorOf(n: SimNode): string {
    const { palette } = this.colors
    return palette[n.colorIndex % palette.length]
  }

  // ------------------------------------------------------------------ cámara

  fit(animate = true) {
    if (!this.nodes.length || !this.width) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x! - n.radius)
      minY = Math.min(minY, n.y! - n.radius)
      maxX = Math.max(maxX, n.x! + n.radius)
      maxY = Math.max(maxY, n.y! + n.radius)
    }
    const pad = 80
    const k = Math.min(
      (this.width - pad * 2) / Math.max(maxX - minX, 1),
      (this.height - pad * 2) / Math.max(maxY - minY, 1),
      1.4,
    )
    const kk = Math.max(MIN_K, k)
    this.flyTo(
      {
        k: kk,
        x: this.width / 2 - ((minX + maxX) / 2) * kk,
        y: this.height / 2 - ((minY + maxY) / 2) * kk,
      },
      animate,
    )
  }

  centerOn(id: string, minZoom = 1.1) {
    const n = this.byId.get(id)
    if (!n) return
    const k = Math.max(this.view.k, minZoom)
    this.flyTo({ k, x: this.width / 2 - n.x! * k, y: this.height / 2 - n.y! * k }, true)
  }

  private flyTo(to: View, animate: boolean) {
    if (!animate) {
      this.view = to
      this.flight = null
    } else {
      this.flight = { from: { ...this.view }, to, start: performance.now(), duration: 650 }
    }
    this.dirty = true
  }

  // ------------------------------------------------------------------ bucle

  private frame = (time: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const physics = this.sim.alpha() > this.sim.alphaMin()
    if (physics) this.sim.tick()
    if (this.flight) {
      const p = Math.min(1, (time - this.flight.start) / this.flight.duration)
      const e = 1 - (1 - p) ** 3
      const { from, to } = this.flight
      this.view = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        k: from.k + (to.k - from.k) * e,
      }
      if (p >= 1) this.flight = null
    }
    // Siempre animado (estrellas y partículas), salvo que no haya nada que mover.
    if (physics || this.flight || this.particles || this.dirty || this.selectedId) {
      this.draw(time)
      this.dirty = false
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * this.dpr)
    this.canvas.height = Math.round(rect.height * this.dpr)
    const count = Math.round((rect.width * rect.height) / 5000)
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      r: Math.random() * 1.1 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }))
    this.dirty = true
  }

  // ------------------------------------------------------------------ dibujo

  private focusSet(): Set<string> | null {
    const id = this.hoverId ?? this.selectedId
    if (!id) return null
    return new Set([id, ...(this.adjacency.get(id) ?? [])])
  }

  private draw(time: number) {
    const { ctx, dpr, width: w, height: h, view, colors } = this
    const focus = this.focusSet()

    // Fondo: color del tema, un halo morado central y un campo de estrellas con paralaje.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, w, h)
    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    glow.addColorStop(0, hexToRgba(colors.accent, colors.dark ? 0.09 : 0.06))
    glow.addColorStop(1, hexToRgba(colors.accent, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
    for (const s of this.stars) {
      const x = (((s.x + view.x * 0.06) % w) + w) % w
      const y = (((s.y + view.y * 0.06) % h) + h) % h
      const twinkle = 0.35 + 0.3 * Math.sin(time / 1400 + s.phase)
      ctx.fillStyle = hexToRgba(colors.dark ? colors.fg : colors.accent, twinkle * 0.45)
      ctx.fillRect(x, y, s.r, s.r)
    }

    // Mundo: nodos y enlaces se escalan con el zoom.
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y)
    const px = 1 / view.k // un píxel de pantalla en unidades del mundo

    for (const l of this.links) {
      const [s, t] = ends(l)
      const lit = !focus || (focus.has(s.id) && focus.has(t.id))
      const color = l.kind === 'schema' ? colors.accent : this.colorOf(s)
      let alpha = { schema: 0.4, member: 0.1, fk: 0.55, m2m: 0.45 }[l.kind]
      if (!lit) alpha *= 0.12
      else if (focus) alpha = Math.min(1, alpha * 1.8)
      ctx.strokeStyle = hexToRgba(color, alpha)
      ctx.lineWidth = (l.kind === 'schema' ? 1.6 : l.kind === 'member' ? 0.8 : 1.2) * px
      ctx.setLineDash(
        l.kind === 'm2m' ? [4 * px, 3 * px] : l.kind === 'member' ? [2 * px, 3 * px] : [],
      )
      ctx.beginPath()
      ctx.moveTo(s.x!, s.y!)
      ctx.lineTo(t.x!, t.y!)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Partículas: viajan en el sentido de la FK (de quien referencia a lo referenciado).
    if (this.particles) {
      for (const l of this.links) {
        if (l.kind === 'member') continue
        const [s, t] = ends(l)
        if (focus && !(focus.has(s.id) && focus.has(t.id))) continue
        const period = l.kind === 'schema' ? 5200 : 2600
        const p = (time / period + hash01(l.id)) % 1
        ctx.fillStyle = hexToRgba(l.kind === 'schema' ? colors.accentSoft : this.colorOf(s), 0.9)
        ctx.beginPath()
        ctx.arc(s.x! + (t.x! - s.x!) * p, s.y! + (t.y! - s.y!) * p, 1.7 * px, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const n of this.nodes) {
      const dim = focus && !focus.has(n.id)
      const color = this.colorOf(n)
      const selected = n.id === this.selectedId
      ctx.globalAlpha = dim ? 0.16 : 1

      if (n.kind === 'table') {
        ctx.shadowColor = color
        ctx.shadowBlur = dim ? 0 : 22
        const g = ctx.createRadialGradient(
          n.x! - n.radius * 0.35,
          n.y! - n.radius * 0.35,
          n.radius * 0.1,
          n.x!,
          n.y!,
          n.radius,
        )
        g.addColorStop(0, hexToRgba(colors.accentSoft, n.junction ? 0.5 : 0.95))
        g.addColorStop(0.45, hexToRgba(color, n.junction ? 0.55 : 0.95))
        g.addColorStop(1, hexToRgba(color, n.junction ? 0.25 : 0.55))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(n.x!, n.y!, n.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = hexToRgba(color, 0.9)
        ctx.lineWidth = 1.2 * px
        ctx.stroke()
      } else {
        const lit = focus?.has(n.id)
        ctx.shadowColor = color
        ctx.shadowBlur = lit || selected ? 14 : 0
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(n.x!, n.y!, n.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (n.expanded) {
          ctx.strokeStyle = hexToRgba(color, 0.6)
          ctx.lineWidth = 1.2 * px
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, n.radius + 3 * px + 1.5, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      if (selected) {
        const pulse = 4 + 2.5 * Math.sin(time / 280)
        ctx.strokeStyle = hexToRgba(colors.accentSoft, 0.95)
        ctx.lineWidth = 2 * px
        ctx.beginPath()
        ctx.arc(n.x!, n.y!, n.radius + pulse * px + 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // Etiquetas en coordenadas de pantalla: mismo tamaño de letra con cualquier zoom.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    for (const n of this.nodes) {
      const isTable = n.kind === 'table'
      const highlighted = focus?.has(n.id) ?? false
      if (!isTable && !highlighted && view.k < 1.5 && n.id !== this.selectedId) continue
      if (isTable && view.k < 0.25 && !highlighted) continue
      const dim = focus && !highlighted
      const sx = n.x! * view.k + view.x
      const sy = n.y! * view.k + view.y + n.radius * view.k + 5
      if (sx < -200 || sx > w + 200 || sy < -50 || sy > h + 50) continue
      ctx.font = isTable
        ? `600 12px 'JetBrains Mono Variable', monospace`
        : `11px 'JetBrains Mono Variable', monospace`
      ctx.globalAlpha = dim ? 0.2 : 1
      ctx.strokeStyle = hexToRgba(colors.bg, 0.85)
      ctx.lineWidth = 4
      const label = !isTable && n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label
      const text = isTable && n.junction ? `${label} ⇄` : label
      ctx.strokeText(text, sx, sy)
      ctx.fillStyle = isTable ? colors.fg : colors.muted
      if (n.id === this.selectedId || n.id === this.hoverId) ctx.fillStyle = colors.accentSoft
      ctx.fillText(text, sx, sy)
    }
    ctx.globalAlpha = 1
  }

  // ------------------------------------------------------------------ interacción

  private toWorld(sx: number, sy: number) {
    return { x: (sx - this.view.x) / this.view.k, y: (sy - this.view.y) / this.view.k }
  }

  private hit(sx: number, sy: number): SimNode | null {
    const p = this.toWorld(sx, sy)
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]
      const r = Math.max(n.radius, 7 / this.view.k) + 2 / this.view.k
      if ((n.x! - p.x) ** 2 + (n.y! - p.y) ** 2 <= r * r) return n
    }
    return null
  }

  private local(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private onPointerDown = (e: PointerEvent) => {
    const { x, y } = this.local(e)
    const node = this.hit(x, y)
    this.canvas.setPointerCapture(e.pointerId)
    this.flight = null
    if (node) {
      this.pointer = { mode: 'drag', node, sx: x, sy: y, moved: false }
      node.fx = node.x
      node.fy = node.y
    } else {
      this.pointer = { mode: 'pan', sx: x, sy: y, start: { ...this.view }, moved: false }
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.local(e)
    const p = this.pointer
    if (p.mode === 'drag') {
      p.moved ||= Math.hypot(x - p.sx, y - p.sy) > 3
      if (p.moved) {
        const w = this.toWorld(x, y)
        p.node.fx = w.x
        p.node.fy = w.y
        this.sim.alphaTarget(0.25)
        if (this.sim.alpha() < 0.25) this.sim.alpha(0.25)
      }
    } else if (p.mode === 'pan') {
      p.moved ||= Math.hypot(x - p.sx, y - p.sy) > 3
      this.view = { ...p.start, x: p.start.x + x - p.sx, y: p.start.y + y - p.sy }
    } else {
      const node = this.hit(x, y)
      const id = node?.id ?? null
      if (id !== this.hoverId) {
        this.hoverId = id
        this.canvas.style.cursor = node ? 'pointer' : 'grab'
      }
    }
    this.dirty = true
  }

  private onPointerUp = () => {
    const p = this.pointer
    if (p.mode === 'drag') {
      p.node.fx = null
      p.node.fy = null
      this.sim.alphaTarget(0)
      if (!p.moved) this.events.select(p.node)
    } else if (p.mode === 'pan' && !p.moved) {
      this.events.select(null)
    }
    this.pointer = { mode: 'idle' }
    this.dirty = true
  }

  private onDoubleClick = (e: MouseEvent) => {
    const { x, y } = this.local(e)
    const node = this.hit(x, y)
    if (node) this.events.activate(node)
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { x, y } = this.local(e)
    const k = Math.min(MAX_K, Math.max(MIN_K, this.view.k * Math.exp(-e.deltaY * 0.0015)))
    this.flight = null
    this.view = {
      k,
      x: x - ((x - this.view.x) * k) / this.view.k,
      y: y - ((y - this.view.y) * k) / this.view.k,
    }
    this.dirty = true
  }

  private onLeave = () => {
    this.hoverId = null
    this.dirty = true
  }

  private bindEvents() {
    const c = this.canvas
    c.style.cursor = 'grab'
    c.style.touchAction = 'none'
    c.addEventListener('pointerdown', this.onPointerDown)
    c.addEventListener('pointermove', this.onPointerMove)
    c.addEventListener('pointerup', this.onPointerUp)
    c.addEventListener('pointercancel', this.onPointerUp)
    c.addEventListener('pointerleave', this.onLeave)
    c.addEventListener('dblclick', this.onDoubleClick)
    c.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private unbind() {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onPointerDown)
    c.removeEventListener('pointermove', this.onPointerMove)
    c.removeEventListener('pointerup', this.onPointerUp)
    c.removeEventListener('pointercancel', this.onPointerUp)
    c.removeEventListener('pointerleave', this.onLeave)
    c.removeEventListener('dblclick', this.onDoubleClick)
    c.removeEventListener('wheel', this.onWheel)
  }
}
