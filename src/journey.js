// Scroll choreography: hero intro, auto-generated flight legs between every
// stop, the generic chapter system (each city gets its own visual builder),
// the pinned DC mega-chapter, the Dubai finale, and passport jumps.

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { CITIES, byId, ROUTE, LEG_NOTES, LEG_ASIDES } from './cities.js'
import { haversineKm } from './geo.js'
import {
  STOP_FOCUS, zoomProxy, applyZoom, initMap, setActiveStop, createTennis,
} from './dcmap.js'
import { splitChars, splitWords, stampCity, odometer } from './ui.js'

gsap.registerPlugin(ScrollTrigger)

const kmFmt = new Intl.NumberFormat('en-US')
const PLANE_ICO = '<svg viewBox="0 0 24 24" class="leg-plane-ico"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>'

let heroChars = []
let tennis = null

/* ================= shared helpers ================= */

function prepSplits() {
  document.querySelectorAll('[data-split]').forEach((el) => {
    const chars = splitChars(el)
    if (el.classList.contains('ht-line')) heroChars.push(...chars)
  })
  document.querySelectorAll('[data-split-words]').forEach((el) => splitWords(el))
}

export function playIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
  tl.set(['#site-header', '#odometer', '#progress-rail'], { opacity: 0 })
    .fromTo(heroChars, { yPercent: 130, rotate: 9 },
      { yPercent: 0, rotate: 0, duration: 0.95, stagger: 0.042, ease: 'back.out(1.7)' }, 0.1)
    .fromTo('.hero-kicker', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6 }, 0.55)
    .fromTo('.hero-sub', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.7 }, 0.75)
    .fromTo('.ticket', { opacity: 0, y: 46, rotate: -7 },
      { opacity: 1, y: 0, rotate: -1.2, duration: 0.9, ease: 'back.out(1.5)' }, 0.9)
    .fromTo('.scroll-cue', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.3)
    .to(['#site-header', '#odometer', '#progress-rail'], { opacity: 1, duration: 0.8 }, 1.1)
}

function initBeginButton(lenis) {
  document.getElementById('begin-btn')?.addEventListener('click', () => {
    const target = document.getElementById('bombay')
    lenis
      ? lenis.scrollTo(target, { offset: innerHeight * 0.5, duration: 2.2, easing: (t) => 1 - Math.pow(1 - t, 3) })
      : target.scrollIntoView({ behavior: 'smooth' })
  })
}

// flight legs between consecutive route stops, generated into the DOM
function buildLegData() {
  const legs = []
  let base = 0
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const from = byId[ROUTE[i]]
    const to = byId[ROUTE[i + 1]]
    const km = haversineKm(from, to)
    legs.push({
      key: `${from.id}-${to.id}`, from, to, km, base,
      flightNo: `RK-${102 + i}`,
      note: LEG_NOTES[`${from.id}-${to.id}`] || 'in transit',
      aside: LEG_ASIDES[`${from.id}-${to.id}`] || null,
    })
    base += km
  }
  return { legs, total: base }
}

function legSectionHTML(leg) {
  const aside = leg.aside
    ? `<div class="leg-aside">
        <div class="leg-aside-tag">${leg.aside.tag}</div>
        <div class="leg-aside-title">${leg.aside.title}</div>
        <div class="leg-aside-role">${leg.aside.role}</div>
        <div class="leg-aside-body">${leg.aside.body}</div>
      </div>`
    : ''
  return `<div class="leg-sticky">
    <div class="leg-caption">
      <div class="leg-tag">IN TRANSIT · ${leg.flightNo}</div>
      <div class="leg-route"><b>${leg.from.code}</b>${PLANE_ICO}<b>${leg.to.code}</b></div>
      <div class="leg-note">${leg.note}</div>
      <div class="leg-km"><span class="leg-km-num">0</span> km</div>
    </div>${aside}</div>`
}

function insertLegSections(legs) {
  for (const leg of legs) {
    const section = document.createElement('section')
    section.className = 'flight-leg'
    section.id = `leg-${leg.key}`
    const h = Math.round(Math.min(230, Math.max(120, 90 + leg.km / 55)))
    section.style.height = `${h}vh`
    section.innerHTML = legSectionHTML(leg)
    document.getElementById(leg.to.id).before(section)
  }
}

function buildLegScroll(leg, globe) {
  const section = document.getElementById(`leg-${leg.key}`)
  const kmEl = section.querySelector('.leg-km-num')
  const d0 = leg.from.depart ?? leg.from.arrive
  const d1 = leg.to.arrive
  const bump = Math.min(0.7, 0.12 + leg.km / 22000)
  const ease = gsap.parseEase('power1.inOut')
  const proxy = { t: 0 }
  let lastKm = -1

  gsap.to(proxy, {
    t: 1,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1, invalidateOnRefresh: true },
    onUpdate: () => {
      globe.setFlight(leg.key, leg.from, leg.to, d0, d1, bump, proxy.t)
      const km = leg.base + leg.km * ease(proxy.t)
      if (Math.abs(km - lastKm) >= 1) {
        lastKm = km
        odometer.set(km)
        kmEl.textContent = kmFmt.format(Math.round(leg.km * ease(proxy.t)))
      }
    },
  })

  const cap = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
  })
  cap.fromTo(section.querySelector('.leg-caption'), { opacity: 0, y: 34 },
    { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out' }, 1.6)
  cap.to(section.querySelector('.leg-caption'), { opacity: 0, y: -26, duration: 1.2, ease: 'power2.in' }, 7.6)
  const asideEl = section.querySelector('.leg-aside')
  if (asideEl) {
    cap.fromTo(asideEl, { opacity: 0, y: 30, rotate: 6 }, { opacity: 1, y: 0, rotate: 2, duration: 1.3, ease: 'back.out(1.4)' }, 3.4)
    cap.to(asideEl, { opacity: 0, y: -24, duration: 1, ease: 'power2.in' }, 8.2)
  }
  cap.set({}, {}, 10)
}

// accent tint + passport stamp per chapter
function initChapterMeta(cityId, triggerSel) {
  ScrollTrigger.create({
    trigger: triggerSel,
    start: 'top 55%',
    end: 'bottom 45%',
    onToggle: (self) => { if (self.isActive) document.body.dataset.accent = cityId },
  })
  ScrollTrigger.create({
    trigger: triggerSel,
    start: 'top 55%',
    once: true,
    onEnter: () => stampCity(cityId, byId[cityId]?.stampDate),
  })
}

/* ================= per-city visual builders =================
   Each returns a PAUSED gsap timeline ~40–60 "units" long.
   full mode: nested into the chapter's scrub timeline
   mobile:    duration-scaled and played once on IntersectionObserver
   reduced:   jumped to progress(1) */

const GLYPHS = [
  'M10 40 L25 10 L40 40 M17 28 H33',                       // peak
  'M12 12 H38 M25 12 V40 M16 40 H34',                      // pillar
  'M25 10 C10 18 10 34 25 42 C40 34 40 18 25 10 M25 20 V32', // fish
  'M12 38 C12 20 38 20 38 38 M12 26 H38',                  // jar
]
const TOKENS = ['p=0.87', 'θ → ka', '∑ wᵢ', '0x4B', 'λ=2.1', 'σ²', 'n-gram', '√ fit']

const VISUALS = {
  bombay(section) {
    const row = section.querySelector('.cipher-row')
    TOKENS.forEach((tok, i) => {
      const tile = document.createElement('div')
      tile.className = 'cipher-tile'
      tile.innerHTML = `
        <div class="cipher-face"><svg viewBox="0 0 50 50"><path d="${GLYPHS[i % GLYPHS.length]}" /></svg></div>
        <div class="cipher-face cipher-face--code">${tok}</div>`
      row.appendChild(tile)
    })
    const tiles = row.querySelectorAll('.cipher-tile')
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(tiles, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: 8, stagger: 1, ease: 'back.out(1.4)' }, 0)
    tl.to(tiles, { rotationX: 180, duration: 10, stagger: 1.6, ease: 'back.out(1.2)' }, 16)
    tl.set({}, {}, 46)
    return tl
  },

  nyc(section) {
    const sky = section.querySelector('.nyc-skyline')
    const heights = [0.42, 0.7, 0.5, 0.88, 0.6, 1, 0.52, 0.78, 0.44, 0.92, 0.64, 0.5, 0.82, 0.58, 0.72, 0.46]
    heights.forEach((h) => {
      const b = document.createElement('i')
      b.className = 'nyc-b'
      b.style.setProperty('--h', h)
      sky.appendChild(b)
    })
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(sky.children, { scaleY: 0 }, { scaleY: 1, duration: 9, stagger: { each: 0.9, from: 'random' }, ease: 'back.out(1.2)' }, 0)
    tl.fromTo(section.querySelector('.nyc-ticker'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 6 }, 10)
    tl.set({}, {}, 42)
    return tl
  },

  mcallen(section) {
    const svg = section.querySelector('svg')
    const arc = svg.querySelector('.rio-bridge-arc')
    const arcLen = 300
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(svg.querySelector('.rio-sun'), { autoAlpha: 0, y: 70 }, { autoAlpha: 0.8, y: 0, duration: 10, ease: 'power2.out' }, 0)
    tl.fromTo(svg.querySelector('.rio-river'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 8 }, 4)
    tl.fromTo(arc, { strokeDasharray: arcLen, strokeDashoffset: arcLen }, { strokeDashoffset: 0, duration: 12, ease: 'power2.inOut' }, 10)
    tl.fromTo(svg.querySelectorAll('.rio-bridge line'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 4, stagger: 1 }, 20)
    tl.fromTo(svg.querySelector('.rio-label'), { autoAlpha: 0, letterSpacing: '1.2em' }, { autoAlpha: 1, letterSpacing: '.5em', duration: 8 }, 24)
    tl.set({}, {}, 44)
    return tl
  },

  cville(section) {
    const svg = section.querySelector('#uva-net')
    const NS = 'http://www.w3.org/2000/svg'
    const founders = [[90, 110], [150, 250], [80, 380], [200, 470], [260, 160], [310, 330], [180, 60]]
    const investors = [[600, 90], [700, 220], [590, 350], [780, 420], [660, 500], [820, 150]]
    const edges = [[0, 0], [0, 5], [1, 1], [1, 2], [2, 2], [3, 4], [4, 0], [4, 5], [5, 1], [5, 3], [6, 5], [2, 4], [3, 2], [6, 0], [1, 4]]
    const HL = [5, 9] // highlighted match edges
    const edgeEls = edges.map(([f, v], i) => {
      const [x1, y1] = founders[f]
      const [x2, y2] = investors[v]
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', x1); line.setAttribute('y1', y1)
      line.setAttribute('x2', x2); line.setAttribute('y2', y2)
      line.setAttribute('class', HL.includes(i) ? 'net-edge net-edge--hl' : 'net-edge')
      const len = Math.hypot(x2 - x1, y2 - y1)
      line.style.strokeDasharray = len
      line.style.strokeDashoffset = len
      svg.appendChild(line)
      return line
    })
    const nodeEls = [...founders.map((p) => [p, 'net-node']), ...investors.map((p) => [p, 'net-node net-node--inv'])].map(([p, cls]) => {
      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 0)
      c.setAttribute('class', cls)
      svg.appendChild(c)
      return c
    })
    const label = document.createElementNS(NS, 'text')
    label.setAttribute('x', 430); label.setAttribute('y', 40)
    label.setAttribute('class', 'net-label')
    label.textContent = 'FOUNDERS ←→ INVESTORS · MATCHED'
    svg.appendChild(label)

    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.to(nodeEls, { attr: { r: 7 }, duration: 6, stagger: 0.6, ease: 'back.out(2.4)' }, 0)
    tl.to(edgeEls, { strokeDashoffset: 0, duration: 10, stagger: 0.8, ease: 'power1.inOut' }, 6)
    tl.fromTo(label, { autoAlpha: 0 }, { autoAlpha: 1, duration: 6 }, 26)
    tl.fromTo(edgeEls.filter((_, i) => HL.includes(i)), { opacity: 0.4 }, { opacity: 1, duration: 6 }, 26)
    tl.set({}, {}, 44)
    return tl
  },

  london(section) {
    const textEl = section.querySelector('.typewriter-text')
    const chars = [...textEl.dataset.type].map((ch) => {
      const s = document.createElement('span')
      s.textContent = ch
      textEl.appendChild(s)
      return s
    })
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(chars, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.7 }, 0)
    tl.fromTo(section.querySelector('.wax-seal'),
      { autoAlpha: 0, scale: 2.2, rotate: 14 },
      { autoAlpha: 1, scale: 1, rotate: -12, duration: 7, ease: 'back.out(2)' }, 28)
    tl.set({}, {}, 46)
    return tl
  },

  paris(section) {
    const words = section.querySelectorAll('.lang-word')
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(section.querySelector('.eiffel'), { autoAlpha: 0, y: 60 }, { autoAlpha: 0.5, y: 0, duration: 10, ease: 'power2.out' }, 0)
    words.forEach((w, i) => {
      tl.fromTo(w, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 3, ease: 'back.out(1.6)' }, 4 + i * 10)
      if (i < words.length - 1) tl.to(w, { autoAlpha: 0, scale: 1.06, duration: 3, ease: 'power1.in' }, 4 + (i + 1) * 10 - 2)
      tl.call(() => {}, null, 4 + i * 10) // keep timeline length stable
    })
    tl.set({}, {}, 48)
    return tl
  },

  madrid(section) {
    const rowEl = section.querySelector('.fan-row')
    const makeFan = (small) => {
      const fan = document.createElement('div')
      fan.className = small ? 'fan fan--small' : 'fan'
      for (let i = 0; i < 7; i++) {
        const blade = document.createElement('i')
        blade.className = 'fan-blade'
        fan.appendChild(blade)
      }
      rowEl.appendChild(fan)
      return fan
    }
    const fans = [makeFan(true), makeFan(false)]
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    fans.forEach((fan, fi) => {
      const blades = fan.querySelectorAll('.fan-blade')
      tl.fromTo(blades, { rotate: 0, autoAlpha: 0 }, {
        rotate: (i) => (i - 3) * 17,
        autoAlpha: 1,
        duration: 10,
        stagger: 0.7,
        ease: 'back.out(1.4)',
      }, fi * 6)
    })
    tl.set({}, {}, 44)
    return tl
  },

  orlando(section) {
    const svg = section.querySelector('.oc')
    const outer = svg.querySelector('.oc-outer')
    const arc = svg.querySelector('.oc-arc')
    const outerLen = 1600
    const arcLen = 600
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(outer, { strokeDasharray: outerLen, strokeDashoffset: outerLen }, { strokeDashoffset: 0, duration: 10, ease: 'power1.inOut' }, 0)
    tl.fromTo(svg.querySelectorAll('.oc-inner'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 3, stagger: 1 }, 8)
    tl.fromTo(svg.querySelector('.oc-net'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 3 }, 13)
    tl.fromTo(arc, { strokeDasharray: `${arcLen}`, strokeDashoffset: arcLen }, { strokeDashoffset: 0, duration: 10, ease: 'power1.inOut' }, 16)
    tl.fromTo(svg.querySelectorAll('.oc-ball'), { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 3, stagger: 2, ease: 'back.out(2.5)' }, 18)
    tl.set({}, {}, 44)
    return tl
  },

  maranello(section) {
    const run = section.querySelector('.kart-run')
    const lines = section.querySelectorAll('.speed-lines i')
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(section.querySelector('.road'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 5 }, 0)
    tl.fromTo(run, { x: 0 }, { x: () => innerWidth + 480, duration: 34, ease: 'power1.inOut' }, 4)
    tl.fromTo(lines, { opacity: 0 }, { opacity: 1, duration: 4, stagger: 0.6 }, 10)
    tl.to(lines, { opacity: 0, duration: 4 }, 30)
    tl.to(run, { y: -2, duration: 2, repeat: 14, yoyo: true, ease: 'sine.inOut' }, 4)
    tl.set({}, {}, 46)
    return tl
  },

  vegas(section) {
    const cards = section.querySelectorAll('.pcard')
    const dice = section.querySelectorAll('.die')
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(cards, { autoAlpha: 0, rotate: 0, y: 60 }, {
      autoAlpha: 1,
      rotate: (i) => (i - 2) * 15,
      y: 0,
      duration: 9,
      stagger: 1.2,
      ease: 'back.out(1.7)',
    }, 0)
    tl.fromTo(dice, { autoAlpha: 0, y: -90, rotate: -160 }, { autoAlpha: 1, y: 0, rotate: (i) => (i ? 8 : -6), duration: 8, stagger: 2, ease: 'bounce.out' }, 12)
    tl.fromTo(section.querySelector('.ev-formula'), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 8 }, 22)
    tl.set({}, {}, 44)
    return tl
  },

  sf(section) {
    const svg = section.querySelector('.gg-bridge')
    const cable = svg.querySelector('.gg-cable')
    const cableLen = 1400
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    tl.fromTo(svg.querySelectorAll('.gg-tower'), { autoAlpha: 0, scaleY: 0, transformOrigin: '50% 100%' },
      { autoAlpha: 1, scaleY: 1, duration: 8, stagger: 2, ease: 'back.out(1.2)' }, 0)
    tl.fromTo(cable, { strokeDasharray: cableLen, strokeDashoffset: cableLen }, { strokeDashoffset: 0, duration: 14, ease: 'power1.inOut' }, 8)
    tl.fromTo(svg.querySelector('.gg-deck'), { scaleX: 0, transformOrigin: '50% 50%' }, { scaleX: 1, duration: 10 }, 12)
    tl.fromTo(svg.querySelectorAll('.gg-hangers line'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 3, stagger: 0.8 }, 18)
    tl.fromTo(section.querySelectorAll('.fog'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 8, stagger: 2 }, 24)
    tl.set({}, {}, 46)
    return tl
  },
}

/* ================= standard chapter builder ================= */

function buildChapter(city, globe) {
  const section = document.getElementById(city.id)
  if (!section) return
  const head = section.querySelector('.ch-head')
  const card = section.querySelector('.ch-card')
  const visual = section.querySelector('.ch-visual')

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: section, start: 'top top', end: 'bottom bottom',
      scrub: 1, invalidateOnRefresh: true,
    },
  })

  // Bombay is the first stop: the camera settles from hero framing
  if (city.id === 'bombay') {
    tl.to(globe.cam, { dist: city.arrive, offX: 0.12, duration: 8, ease: 'power2.out' }, 0)
  }

  tl.fromTo(head, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2, ease: 'power2.out' }, 1)
  const words = head.querySelectorAll('.word')
  if (words.length) {
    tl.fromTo(words, { yPercent: 130 }, { yPercent: 0, duration: 6, stagger: 0.9, ease: 'back.out(1.5)' }, 1)
  }
  tl.fromTo(card, { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: 7, ease: 'power3.out' }, 6)

  const v = VISUALS[city.id]?.(section)
  if (v) {
    v.paused(false)
    tl.add(v, 9)
  }

  tl.to([head, card], { autoAlpha: 0, y: -60, duration: 6, ease: 'power2.in' }, 86)
  if (visual) tl.to(visual, { autoAlpha: 0, duration: 6, ease: 'power2.in' }, 87)
  tl.set({}, {}, 100)

  // the rally toy only runs while its chapter is on screen
  if (city.id === 'orlando') {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 80%',
      end: 'bottom 20%',
      onToggle: (self) => (self.isActive ? tennis?.start() : tennis?.stop()),
    })
  }

  initChapterMeta(city.id, section)
}

/* ================= DC mega chapter (bespoke) ================= */

const STOP_THRESHOLDS = [
  [0.0, 'intro'], [0.13, 'sidwell'], [0.27, 'athletiq'], [0.4, 'secret'],
  [0.53, 'umd'], [0.63, 'gmu'], [0.755, 'iroc'], [0.86, 'honors'], [0.94, 'exit'],
]
let currentStop = null

function trackStop(p) {
  let stop = 'intro'
  for (const [at, id] of STOP_THRESHOLDS) if (p >= at) stop = id
  if (stop === currentStop) return
  currentStop = stop
  setActiveStop(stop)
}

function buildDCTimeline(globe, hopDots) {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '#dc', start: 'top top', end: 'bottom bottom',
      scrub: 1, invalidateOnRefresh: true,
      onUpdate: (self) => trackStop(self.progress),
      onLeave: () => trackStop(1),
      onLeaveBack: () => trackStop(0),
    },
  })

  const Z = (stop, pos, dur = 3) =>
    tl.to(zoomProxy, { ...STOP_FOCUS[stop], duration: dur, ease: 'power2.inOut', onUpdate: applyZoom }, pos)

  const hop = (id, pos, dur = 2) => {
    if (!hopDots[id]) return
    tl.fromTo(hopDots[id], { attr: { r: 0 } },
      { attr: { r: 3 }, duration: dur, stagger: dur / hopDots[id].length, ease: 'back.out(2.5)' }, pos)
  }

  const cardIn = (stop, pos, dur = 3) => {
    const card = document.querySelector(`.dc-card[data-stop='${stop}'], .dc-honors[data-stop='${stop}']`)
    if (!card) return
    tl.fromTo(card, { autoAlpha: 0, y: 74 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power3.out' }, pos)
    const words = card.querySelectorAll('.word')
    if (words.length) {
      tl.fromTo(words, { yPercent: 130 },
        { yPercent: 0, duration: dur * 0.85, stagger: (dur * 0.55) / words.length, ease: 'back.out(1.5)' }, pos + dur * 0.15)
    }
  }
  const cardOut = (stop, pos, dur = 2) => {
    const card = document.querySelector(`.dc-card[data-stop='${stop}'], .dc-honors[data-stop='${stop}']`)
    if (card) tl.to(card, { autoAlpha: 0, y: -54, duration: dur, ease: 'power2.in' }, pos)
  }

  tl.to('#globe-canvas', { opacity: 0.1, scale: 1.07, duration: 5, ease: 'power1.inOut' }, 0)
  tl.to('#dc-map', { opacity: 1, duration: 4, ease: 'power1.out' }, 0.5)
  tl.to(globe.cam, { dist: 1.85, duration: 6, ease: 'power2.in' }, 0)
  Z('overview', 0, 8)

  cardIn('intro', 3, 3.5)
  cardOut('intro', 11.5, 2)

  Z('sidwell', 13, 3)
  cardIn('sidwell', 15.5, 3)
  cardOut('sidwell', 25, 2)

  hop('hop-sidwell-athletiq', 27, 2)
  Z('athletiq', 27, 3)
  cardIn('athletiq', 29.5, 3)
  tl.fromTo('.iq-bars i', { scaleY: 0 }, { scaleY: 1, duration: 2, stagger: 0.22, ease: 'back.out(1.8)' }, 30.5)
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count)
    const proxy = { v: 0 }
    tl.to(proxy, {
      v: target, duration: 2.4, ease: 'power1.out',
      onUpdate: () => { el.textContent = Math.round(proxy.v) },
    }, 30.5)
  })
  cardOut('athletiq', 38, 2)

  hop('hop-athletiq-secret', 40, 2)
  Z('secret', 40, 3)
  cardIn('secret', 42.5, 3)
  cardOut('secret', 51, 2)

  hop('hop-secret-umd', 53, 2)
  Z('umd', 53, 3)
  cardIn('umd', 55.5, 2.5)
  cardOut('umd', 60.5, 2)

  hop('hop-umd-gmu', 62.5, 2.5)
  Z('gmu', 62.5, 3.5)
  cardIn('gmu', 66, 3)
  tl.fromTo('.tdx-line--chain i', { opacity: 0.1 }, { opacity: 1, duration: 1.6, stagger: 0.3, ease: 'power1.in' }, 67.5)
  tl.fromTo('.tdx-check', { strokeDasharray: 30, strokeDashoffset: 30 }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.out' }, 69.5)
  tl.fromTo('.tdx-ok', { opacity: 0 }, { opacity: 1, duration: 1.2 }, 69.3)
  cardOut('gmu', 73.5, 2)

  hop('hop-gmu-iroc', 75.5, 2)
  Z('iroc', 75.5, 3)
  cardIn('iroc', 78, 3)
  cardOut('iroc', 84, 2)

  Z('overview', 85.5, 4)
  cardIn('honors', 87, 3)
  tl.fromTo('.honor-stamp', { scale: 1.7, opacity: 0, rotate: 10 },
    { scale: 1, opacity: 1, rotate: (i) => [-2, 1.5, -1][i] ?? -2, duration: 1.6, stagger: 0.5, ease: 'back.out(2)' }, 87.5)
  cardOut('honors', 92.5, 2)

  Z('overviewFar', 94, 5)
  tl.to('#dc-map', { opacity: 0, duration: 4, ease: 'power1.in' }, 94.5)
  tl.to('#globe-canvas', { opacity: 1, scale: 1, duration: 5, ease: 'power1.out' }, 94.5)
  tl.to(globe.cam, { dist: byId.dc.depart, duration: 5.5, ease: 'power2.out' }, 94)
  tl.set({}, {}, 100)

  initChapterMeta('dc', '#dc')
}

/* ================= finale + arrival ================= */

// split-flap tiles that shuffle letters and never resolve — the destination
// is whichever campus comes next
function buildFlaps() {
  const row = document.getElementById('flap-row')
  if (!row) return { start() {}, stop() {} }
  const N = 8
  const tiles = []
  for (let i = 0; i < N; i++) {
    const t = document.createElement('i')
    t.className = 'flap'
    t.textContent = '?'
    row.appendChild(t)
    tiles.push(t)
  }
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ????'
  let iv = null
  return {
    start() {
      if (iv) return
      iv = setInterval(() => {
        for (let k = 0; k < 2; k++) {
          const t = tiles[Math.floor(Math.random() * N)]
          t.textContent = CHARS[Math.floor(Math.random() * CHARS.length)]
          t.classList.remove('is-tick')
          void t.offsetWidth
          t.classList.add('is-tick')
        }
      }, 110)
    },
    stop() {
      clearInterval(iv)
      iv = null
      tiles.forEach((t) => { t.textContent = '?' })
    },
  }
}

function buildFinale(globe, totalKm) {
  const head = document.querySelector('.finale-head')
  const words = head.querySelectorAll('.word')
  const dubai = byId.dubai

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '#finale', start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true },
  })

  // pull way out and drift east so the whole glowing route reads
  tl.to(globe.cam, { dist: 4.4, lat: 27, lon: -40, offX: 0, offY: 0, duration: 55, ease: 'power1.inOut' }, 0)

  // make sure every leg's arc is fully drawn in the wide shot
  for (const [key, arc] of globe.arcs) {
    if (key === 'sf-dubai') continue
    tl.to(arc.mat.uniforms.uHead, { value: 1, duration: 12, ease: 'power1.in' }, 4)
  }
  // the confirmed trip (Dubai) draws quietly...
  const teaser = globe.arcs.get('sf-dubai')
  if (teaser) tl.to(teaser.mat.uniforms.uHead, { value: 1, duration: 20, ease: 'power1.inOut' }, 20)
  const dubaiPin = globe.pins.get('dubai')
  if (dubaiPin) tl.to(dubaiPin.group.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 14, ease: 'back.out(2)' }, 30)

  // ...while the real question fans out: unfinished arcs to unknown campuses
  for (const [key, arc] of globe.arcs) {
    if (!key.startsWith('mystery-')) continue
    const i = parseInt(key.split('-')[1], 10)
    tl.to(arc.mat.uniforms.uHead, {
      value: 0.55 + (i % 3) * 0.12,
      duration: 22,
      ease: 'power1.inOut',
    }, 30 + i * 4)
  }

  // shuffle the destination tiles while the finale is on screen
  const flaps = buildFlaps()
  ScrollTrigger.create({
    trigger: '#finale',
    start: 'top 75%',
    end: 'bottom top',
    onToggle: (self) => (self.isActive ? flaps.start() : flaps.stop()),
  })

  tl.fromTo(head, { autoAlpha: 0 }, { autoAlpha: 1, duration: 4 }, 12)
  if (words.length) {
    tl.fromTo(words, { yPercent: 130 }, { yPercent: 0, duration: 8, stagger: 1.2, ease: 'back.out(1.5)' }, 12)
  }
  tl.set({}, {}, 100)

  ScrollTrigger.create({
    trigger: '#finale', start: 'top 55%', once: true,
    onEnter: () => {
      document.body.dataset.accent = 'dubai'
      stampCity('dubai', dubai.stampDate)
      odometer.set(totalKm)
    },
  })

  // arrival reveals
  ScrollTrigger.create({
    trigger: '.customs-card', start: 'top 85%', once: true,
    onEnter: () => {
      gsap.fromTo('.customs-card', { autoAlpha: 0, y: 60, rotate: -1.5 },
        { autoAlpha: 1, y: 0, rotate: 0, duration: 0.9, ease: 'power3.out' })
      gsap.fromTo('.customs-admitted', { scale: 2.4, opacity: 0, rotate: 24 },
        { scale: 1, opacity: 0.85, rotate: 10, duration: 0.6, delay: 0.6, ease: 'back.out(2.5)' })
    },
  })
  ScrollTrigger.create({
    trigger: '.tag-strip', start: 'top 88%', once: true,
    onEnter: () => gsap.fromTo('.lug-tag', { autoAlpha: 0, y: 26, rotate: -4 },
      { autoAlpha: 1, y: 0, rotate: 0, duration: 0.55, stagger: 0.05, ease: 'back.out(1.8)' }),
  })
  initDepartures()
}

function initDepartures() {
  const rows = gsap.utils.toArray('.dep-row')
  ScrollTrigger.create({
    trigger: '.dep-board', start: 'top 88%', once: true,
    onEnter: () => gsap.to(rows, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out' }),
  })
}

/* ================= FULL MODE ================= */

export function initFull({ globe, lenis }) {
  prepSplits()
  initBeginButton(lenis)
  const hopDots = initMap()
  tennis = createTennis()

  const { legs, total } = buildLegData()
  insertLegSections(legs)

  /* hero: kill idle sway + fade copy as you leave */
  gsap.to(globe.cam, {
    drift: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '25% top', scrub: true },
  })
  gsap.timeline({
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 60%', scrub: 0.6 },
  })
    .to('.hero-copy', { y: -90, opacity: 0, ease: 'power1.in' }, 0)
    .to('.scroll-cue', { opacity: 0 }, 0)
  // hand the globe from hero-right framing toward center before Bombay
  gsap.to(globe.cam, {
    offX: 0.12, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1 },
  })

  for (const leg of legs) buildLegScroll(leg, globe)
  for (const id of ROUTE) {
    if (id === 'dc') continue
    buildChapter(byId[id], globe)
  }
  buildDCTimeline(globe, hopDots)
  buildFinale(globe, total)
}

/* ================= LITE MODES (mobile / reduced) ================= */

export function initLite({ globe, lenis, mode }) {
  initBeginButton(lenis)
  const hopDots = initMap()
  Object.assign(zoomProxy, STOP_FOCUS.overview)
  applyZoom()
  setActiveStop('honors')
  Object.values(hopDots).forEach((dots) => dots.forEach((d) => d.setAttribute('r', 3)))

  tennis = createTennis()
  const court = document.getElementById('tennis-court')
  if (court) {
    new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? tennis.start() : tennis.stop())),
      { threshold: 0.2 }
    ).observe(court)
  }

  const { legs, total } = buildLegData()

  // per-city visuals: play once in view (mobile) or jump to end (reduced)
  for (const id of ROUTE) {
    if (id === 'dc') continue
    const section = document.getElementById(id)
    const v = VISUALS[id]?.(section)
    if (!v) continue
    if (mode === 'reduced') {
      v.progress(1).pause()
    } else {
      new IntersectionObserver((entries, io) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          io.unobserve(e.target)
          v.duration(1.6).play()
        })
      }, { threshold: 0.25 }).observe(section)
    }
    initChapterMeta(id, section)
  }
  initChapterMeta('dc', '#dc')

  // DC micro-anims fire once on view
  const microIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      microIO.unobserve(e.target)
      if (e.target.matches('.iq-dash')) {
        gsap.fromTo('.iq-bars i', { scaleY: 0 }, { scaleY: 1, duration: 0.9, stagger: 0.09, ease: 'back.out(1.8)' })
        document.querySelectorAll('[data-count]').forEach((el) => {
          const proxy = { v: 0 }
          gsap.to(proxy, {
            v: parseFloat(el.dataset.count), duration: 1.2, ease: 'power1.out',
            onUpdate: () => { el.textContent = Math.round(proxy.v) },
          })
        })
      }
      if (e.target.matches('.honor-row')) {
        gsap.fromTo('.honor-stamp', { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, stagger: 0.16, ease: 'back.out(2)' })
      }
    })
  }, { threshold: 0.3 })
  ;['.iq-dash', '.honor-row'].forEach((s) => {
    const el = document.querySelector(s)
    if (el) microIO.observe(el)
  })

  if (mode === 'mobile' && globe) {
    globe.cam.offX = 0
    globe.cam.offY = 0.35
    globe.cam.dist = 4.0
    insertLegSections(legs)
    for (const leg of legs) {
      const section = document.getElementById(`leg-${leg.key}`)
      const kmEl = section.querySelector('.leg-km-num')
      ScrollTrigger.create({
        trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1,
        onUpdate: (self) => {
          globe.setFlight(leg.key, leg.from, leg.to, 3.6, 3.6, 0.4, self.progress)
          odometer.set(leg.base + leg.km * self.progress)
          kmEl.textContent = kmFmt.format(Math.round(leg.km * self.progress))
        },
      })
    }
    gsap.to(globe.cam, {
      drift: 0, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: '40% top', scrub: true },
    })
    // finale zoom-out still plays on mobile
    ScrollTrigger.create({
      trigger: '#finale', start: 'top bottom', end: 'bottom top', scrub: 1,
      onUpdate: (self) => {
        globe.cam.dist = 3.6 + self.progress * 1.2
      },
    })
    const teaser = globe.arcs.get('sf-dubai')
    ScrollTrigger.create({
      trigger: '#finale', start: 'top 80%', end: 'bottom bottom', scrub: 1,
      onUpdate: (self) => {
        if (teaser) teaser.mat.uniforms.uHead.value = self.progress
        for (const [key, arc] of globe.arcs) {
          if (!key.startsWith('mystery-')) continue
          const i = parseInt(key.split('-')[1], 10)
          arc.mat.uniforms.uHead.value = self.progress * (0.55 + (i % 3) * 0.12)
        }
      },
    })
  } else {
    odometer.set(total)
  }

  // the unresolved-destination tiles
  const flaps = buildFlaps()
  if (mode === 'reduced') {
    flaps.stop() // static ????????
  } else {
    ScrollTrigger.create({
      trigger: '#finale', start: 'top 80%', end: 'bottom top',
      onToggle: (self) => (self.isActive ? flaps.start() : flaps.stop()),
    })
  }

  ScrollTrigger.create({
    trigger: '#finale', start: 'top 60%', once: true,
    onEnter: () => { stampCity('dubai', byId.dubai.stampDate); odometer.set(total) },
  })
  if (mode !== 'reduced') {
    initDepartures()
    ScrollTrigger.create({
      trigger: '.tag-strip', start: 'top 90%', once: true,
      onEnter: () => gsap.fromTo('.lug-tag', { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(1.6)' }),
    })
  } else {
    document.querySelectorAll('.dep-row').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none' })
  }
}
