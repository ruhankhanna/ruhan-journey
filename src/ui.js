// Site chrome: custom cursor, passport overlay + stamps, odometer, progress
// rail, split-text helpers.

import gsap from 'gsap'
import { CITIES } from './cities.js'

/* ---------- split text ---------- */
export function splitChars(el) {
  const text = el.textContent
  el.textContent = ''
  const frag = document.createDocumentFragment()
  for (const ch of text) {
    const span = document.createElement('span')
    span.className = 'char'
    span.textContent = ch === ' ' ? ' ' : ch
    frag.appendChild(span)
  }
  el.appendChild(frag)
  return el.querySelectorAll('.char')
}

export function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/)
  el.textContent = ''
  words.forEach((w, i) => {
    const span = document.createElement('span')
    span.className = 'word'
    span.textContent = w
    el.appendChild(span)
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
  return el.querySelectorAll('.word')
}

/* ---------- cursor ---------- */
export function initCursor() {
  const root = document.getElementById('cursor')
  const dot = document.getElementById('cursor-dot')
  const ring = document.getElementById('cursor-ring')
  const label = document.getElementById('cursor-label')
  const pos = { x: innerWidth / 2, y: innerHeight / 2 }
  const ringPos = { x: pos.x, y: pos.y }

  window.addEventListener('pointermove', (e) => {
    pos.x = e.clientX
    pos.y = e.clientY
  })
  window.addEventListener('pointerdown', () => root.classList.add('is-down'))
  window.addEventListener('pointerup', () => root.classList.remove('is-down'))

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-hover], a, button')
    if (t) {
      root.classList.add('is-active')
      label.textContent = t.dataset.cursorLabel || ''
    } else {
      root.classList.remove('is-active')
    }
  })

  gsap.ticker.add(() => {
    ringPos.x += (pos.x - ringPos.x) * 0.16
    ringPos.y += (pos.y - ringPos.y) * 0.16
    dot.style.left = `${pos.x}px`
    dot.style.top = `${pos.y}px`
    ring.style.left = `${ringPos.x}px`
    ring.style.top = `${ringPos.y}px`
  })
}

/* ---------- odometer ---------- */
const odoNum = () => document.getElementById('odo-num')
const fmt = new Intl.NumberFormat('en-US')
export const odometer = {
  value: 0,
  set(v) {
    this.value = v
    const el = odoNum()
    if (el) el.textContent = fmt.format(Math.round(v))
  },
}

/* ---------- passport ---------- */
const visited = new Set()
let passportJump = null

export function initPassport(onJump) {
  passportJump = onJump
  const grid = document.getElementById('stamp-grid')
  const tilts = [-3, 2, -1.5, 2.5, -2, 1, -2.5, 3, -1]
  CITIES.forEach((c, i) => {
    const b = document.createElement('button')
    b.className = 'pp-stamp pp-stamp--locked'
    b.style.setProperty('--tilt', `${tilts[i % tilts.length]}deg`)
    b.style.setProperty('--c', c.accent)
    b.dataset.city = c.id
    b.innerHTML = `
      <span class="pp-stamp-code">${c.code}</span>
      <span class="pp-stamp-name">${c.name.toUpperCase()}</span>
      <span class="pp-stamp-date">${c.future ? 'SCHEDULED 2027' : 'BOARDING SOON'}</span>`
    b.disabled = true
    grid.appendChild(b)
  })

  const overlay = document.getElementById('passport-overlay')
  const btn = document.getElementById('passport-btn')
  const book = overlay.querySelector('.passport-book')

  const open = () => {
    overlay.hidden = false
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' })
    gsap.fromTo(
      book,
      { y: 40, rotate: -2, scale: 0.94 },
      { y: 0, rotate: 0, scale: 1, duration: 0.55, ease: 'back.out(1.5)' }
    )
  }
  const close = () => {
    gsap.to(overlay, {
      opacity: 0, duration: 0.2, ease: 'power2.in',
      onComplete: () => { overlay.hidden = true },
    })
  }
  btn.addEventListener('click', open)
  overlay.querySelectorAll('[data-close-passport]').forEach((el) => el.addEventListener('click', close))
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close() })

  grid.addEventListener('click', (e) => {
    const stamp = e.target.closest('.pp-stamp--stamped')
    if (!stamp) return
    close()
    passportJump?.(stamp.dataset.city)
  })
}

export function stampCity(id, dateLabel = 'JUL 2026') {
  if (visited.has(id)) return
  visited.add(id)
  const stamp = document.querySelector(`.pp-stamp[data-city='${id}']`)
  if (stamp) {
    stamp.classList.remove('pp-stamp--locked')
    stamp.classList.add('pp-stamp--stamped')
    stamp.disabled = false
    stamp.dataset.hover = ''
    stamp.dataset.cursorLabel = 'FLY'
    stamp.querySelector('.pp-stamp-date').textContent = dateLabel
  }
  const count = document.getElementById('passport-count')
  count.textContent = `${visited.size}/13`
  const btn = document.getElementById('passport-btn')
  btn.classList.remove('is-bump')
  void btn.offsetWidth
  btn.classList.add('is-bump')
}

/* ---------- progress rail ---------- */
export function initRail(sections) {
  const rail = document.getElementById('progress-rail')
  const ticksWrap = rail.querySelector('.rail-ticks')
  const plane = document.getElementById('rail-plane')
  const ticks = []

  const layout = () => {
    ticksWrap.innerHTML = ''
    ticks.length = 0
    const total = document.documentElement.scrollHeight - innerHeight
    sections.forEach((sel) => {
      const el = document.querySelector(sel)
      if (!el) return
      const frac = Math.min(1, el.offsetTop / total)
      const tick = document.createElement('div')
      tick.className = 'rail-tick'
      tick.style.top = `${frac * 100}%`
      ticksWrap.appendChild(tick)
      ticks.push({ tick, frac })
    })
  }
  layout()
  window.addEventListener('resize', layout)

  const railH = () => rail.clientHeight
  window.addEventListener(
    'scroll',
    () => {
      const total = document.documentElement.scrollHeight - innerHeight
      const p = total > 0 ? window.scrollY / total : 0
      plane.style.top = `${p * railH()}px`
      ticks.forEach(({ tick, frac }) => tick.classList.toggle('is-hit', p >= frac - 0.005))
    },
    { passive: true }
  )
}

/* ---------- generic reveal (mobile / reduced / departures) ---------- */
export function initReveals(selector = '.reveal-fade') {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      })
    },
    { threshold: 0.18 }
  )
  document.querySelectorAll(selector).forEach((el) => io.observe(el))
}
