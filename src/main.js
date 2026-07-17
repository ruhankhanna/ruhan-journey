// Boot: mode detection, loader sequence, globe init, scroll plumbing.

import './styles.css'
import 'lenis/dist/lenis.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { CITIES, byId, ROUTE } from './cities.js'
import { buildLandMask, drawFlatMap } from './geo.js'
import { Globe } from './globe.js'
import { initCursor, initPassport, initRail, initReveals, odometer } from './ui.js'
import { initFull, initLite, playIntro } from './journey.js'

gsap.registerPlugin(ScrollTrigger)

/* ---------- mode ---------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const mobile =
  matchMedia('(max-width: 860px)').matches ||
  (matchMedia('(pointer: coarse)').matches && innerWidth < 1100)
// ?mode=full|mobile|reduced — debug override for testing a specific mode
const forced = new URLSearchParams(location.search).get('mode')
const MODE = ['full', 'mobile', 'reduced'].includes(forced)
  ? forced
  : reduced ? 'reduced' : mobile ? 'mobile' : 'full'
document.documentElement.classList.remove('no-js')
document.documentElement.classList.add(`mode-${MODE}`)

/* ---------- loader ---------- */
const loader = document.getElementById('loader')
const loaderBar = loader.querySelector('.loader-bar i')
const loaderPlane = loader.querySelector('.loader-plane')
const loaderPct = loader.querySelector('.loader-pct')
const loaderStamp = loader.querySelector('.loader-stamp')
const pct = { v: 0 }

function renderPct() {
  const v = Math.round(pct.v)
  loaderPct.textContent = `${String(v).padStart(2, '0')}%`
  loaderBar.style.width = `${v}%`
  loaderPlane.style.transform = `translateX(${(v / 100) * 212}px) rotate(45deg)`
}
const preTween = gsap.to(pct, { v: 86, duration: 1.3, ease: 'power2.out', onUpdate: renderPct })

function finishLoader(then) {
  preTween.kill()
  let done = false
  const reveal = () => {
    if (done) return
    done = true
    loader.remove()
    then?.()
  }
  gsap.to(pct, {
    v: 100, duration: 0.35, ease: 'power1.in', onUpdate: renderPct,
    onComplete: () => {
      loaderStamp.classList.add('is-on')
      gsap.to(loader, { opacity: 0, duration: 0.6, delay: 0.75, ease: 'power2.inOut', onComplete: reveal })
    },
  })
  // backstop: if rAF is throttled (background tab), don't strand the loader
  setTimeout(reveal, 3200)
}

/* ---------- boot ---------- */
async function boot() {
  buildLandMask()

  let globe = null
  let lenis = null

  if (MODE !== 'reduced') {
    globe = new Globe(document.getElementById('globe-canvas'), {
      quality: MODE === 'full' ? 'high' : 'low',
    })
    // every journey city gets a bright pin; Dubai waits as a dim gold teaser
    for (const c of CITIES) {
      globe.addPin(c.id, { lat: c.lat, lon: c.lon, accent: c.accent, dim: !!c.future })
    }
    // one arc per flight leg, tinted from origin to destination accent
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const from = byId[ROUTE[i]]
      const to = byId[ROUTE[i + 1]]
      globe.addArc(`${from.id}-${to.id}`, from, to, from.accent, to.accent)
    }
    // the un-flown teaser leg, drawn in the finale
    globe.addArc('sf-dubai', byId.sf, byId.dubai, byId.sf.accent, byId.dubai.accent)
  } else {
    const flat = document.getElementById('flatmap-canvas')
    const route = [...ROUTE.map((id) => byId[id]), byId.dubai]
    const draw = () => drawFlatMap(flat, route, CITIES)
    draw()
    window.addEventListener('resize', draw)
  }

  if (MODE === 'full') {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.92 })
    window.__lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => lenis.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
    initCursor()
  }

  initPassport((cityId) => {
    const target = document.getElementById(cityId === 'dubai' ? 'finale' : cityId)
    if (!target) return
    if (lenis) lenis.scrollTo(target, { offset: innerHeight * 0.6, duration: 2, easing: (t) => 1 - Math.pow(1 - t, 3) })
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  })

  odometer.set(0)

  if (MODE === 'full') {
    initFull({ globe, lenis })
    initRail(['#hero', ...ROUTE.map((id) => `#${id}`), '#finale', '#arrival'])
  } else {
    initLite({ globe, lenis, mode: MODE })
    document
      .querySelectorAll('.dc-card, .dc-honors, .leg-caption, .customs-card, .finale-head')
      .forEach((el) => el.classList.add('reveal-fade'))
    initReveals()
    if (MODE === 'reduced') {
      document.querySelectorAll('.dep-row, .lug-tag').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none' })
    }
  }

  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
  ScrollTrigger.refresh()

  finishLoader(() => {
    if (MODE === 'full') playIntro()
    else gsap.fromTo('.hero-copy', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })
  })
}

boot()
