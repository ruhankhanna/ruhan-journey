// The DMV field map: pan/zoom controller, hop-dot trails, pin states, and the
// tennis-ball rally toy.

import gsap from 'gsap'

const VB = { w: 1200, h: 800 }

function focusVals(px, py, s, fx = 0.5, fy = 0.5) {
  return { x: VB.w * fx - s * px, y: VB.h * fy - s * py, s }
}

// where the camera (map transform) sits for each stop; fx/fy places the pin
// on the opposite side of the card
export const STOP_FOCUS = {
  overviewFar: focusVals(600, 400, 0.78),
  overview: focusVals(600, 400, 0.98),
  sidwell: focusVals(585, 330, 1.9, 0.3, 0.5),
  athletiq: focusVals(505, 240, 1.9, 0.68, 0.46),
  secret: focusVals(612, 360, 1.9, 0.3, 0.52),
  umd: focusVals(830, 265, 1.55, 0.66, 0.45),
  gmu: focusVals(278, 530, 1.8, 0.32, 0.55),
  iroc: focusVals(502, 462, 1.9, 0.68, 0.5),
}

export const zoomProxy = { ...STOP_FOCUS.overviewFar }
let zoomEl = null

export function applyZoom() {
  if (!zoomEl) return
  zoomEl.setAttribute(
    'transform',
    `translate(${zoomProxy.x.toFixed(2)} ${zoomProxy.y.toFixed(2)}) scale(${zoomProxy.s.toFixed(4)})`
  )
}

export function initMap() {
  zoomEl = document.getElementById('dmv-zoom')
  applyZoom()
  return buildHopDots()
}

// replace dotted hop paths with pop-in dot trails
function buildHopDots() {
  const svgns = 'http://www.w3.org/2000/svg'
  const dots = {}
  document.querySelectorAll('.hop').forEach((path) => {
    const L = path.getTotalLength()
    const n = Math.max(6, Math.round(L / 24))
    const g = document.createElementNS(svgns, 'g')
    g.setAttribute('class', 'hop-dots')
    const list = []
    for (let i = 0; i < n; i++) {
      const p = path.getPointAtLength((L * i) / (n - 1))
      const c = document.createElementNS(svgns, 'circle')
      c.setAttribute('cx', p.x)
      c.setAttribute('cy', p.y)
      c.setAttribute('r', 0)
      c.setAttribute('fill', 'var(--acid)')
      g.appendChild(c)
      list.push(c)
    }
    path.parentNode.insertBefore(g, path)
    path.style.display = 'none'
    dots[path.id] = list
  })
  return dots
}

const PIN_FOR_STOP = {
  sidwell: 'dpin-sidwell',
  athletiq: 'dpin-athletiq',
  secret: 'dpin-secret',
  umd: 'dpin-umd',
  gmu: 'dpin-gmu',
  iroc: 'dpin-iroc',
}

export function setActiveStop(stop) {
  document.querySelectorAll('.dpin').forEach((pin) => {
    const on = stop === 'honors' || pin.id === PIN_FOR_STOP[stop]
    pin.classList.toggle('is-active', on)
  })
}

/* ---------------- tennis rally toy ---------------- */
export function createTennis() {
  const court = document.getElementById('tennis-court')
  const ball = document.getElementById('tennis-ball')
  const rallyEl = document.getElementById('tennis-rally')
  const rallyNum = rallyEl.querySelector('b')
  if (!court || !ball) return { start() {}, stop() {} }

  ball.style.left = '0px'
  ball.style.top = '0px'

  const S = 26 // ball size
  const state = {
    x: 30, y: 0, vx: 0, vy: 0,
    squash: 0, rally: 0, airborne: false, raf: null, last: 0,
  }

  const bounds = () => ({ w: court.clientWidth, h: court.clientHeight })
  state.y = 130 - S - 10

  function render() {
    const sy = 1 - state.squash * 0.35
    const sx = 1 + state.squash * 0.28
    ball.style.transform = `translate(${state.x}px, ${state.y}px) scale(${sx}, ${sy})`
  }

  function step(now) {
    const dt = Math.min((now - state.last) / 1000, 0.033)
    state.last = now
    const { w, h } = bounds()
    const floor = h - S - 10

    state.vy += 2400 * dt
    state.x += state.vx * dt
    state.y += state.vy * dt
    state.squash = Math.max(0, state.squash - dt * 6)

    if (state.x < 8) { state.x = 8; state.vx *= -0.82 }
    if (state.x > w - S - 8) { state.x = w - S - 8; state.vx *= -0.82 }
    if (state.y >= floor) {
      state.y = floor
      if (Math.abs(state.vy) > 90) {
        state.vy *= -0.58
        state.vx *= 0.92
        state.squash = 1
      } else {
        state.vy = 0
        state.vx *= 0.9
        if (state.airborne) {
          state.airborne = false
          state.rally = 0
          gsap.to(rallyEl, { opacity: 0, duration: 0.6, delay: 0.8, onComplete: () => rallyEl.classList.remove('is-on') })
        }
      }
    }
    render()
    state.raf = requestAnimationFrame(step)
  }

  function hit() {
    const { w } = bounds()
    const towardCenter = state.x > w / 2 ? -1 : 1
    state.vy = -(620 + Math.random() * 260)
    state.vx = towardCenter * (140 + Math.random() * 220)
    state.rally += 1
    state.airborne = true
    rallyEl.classList.add('is-on')
    gsap.set(rallyEl, { opacity: 1 })
    rallyNum.textContent = state.rally
    gsap.fromTo(rallyEl, { scale: 1.5, rotate: -6 }, { scale: 1, rotate: 0, duration: 0.4, ease: 'back.out(3)' })
  }

  court.addEventListener('pointerdown', hit)

  return {
    start() {
      if (state.raf) return
      state.last = performance.now()
      state.raf = requestAnimationFrame(step)
    },
    stop() {
      if (state.raf) cancelAnimationFrame(state.raf)
      state.raf = null
    },
  }
}
