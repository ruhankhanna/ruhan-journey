// Land mask + dotted-continent sampling, shared by the 3D globe and the
// reduced-motion flat map. world-atlas land polygons are rasterized once to an
// offscreen canvas, then sampled on a roughly equal-area lat/lon grid.

import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldData from 'world-atlas/land-110m.json'

const MASK_W = 1024
const MASK_H = 512

let maskData = null

export function buildLandMask() {
  if (maskData) return
  const land = feature(worldData, worldData.objects.land)
  const canvas = document.createElement('canvas')
  canvas.width = MASK_W
  canvas.height = MASK_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const projection = geoEquirectangular()
    .scale(MASK_W / (2 * Math.PI))
    .translate([MASK_W / 2, MASK_H / 2])
  const path = geoPath(projection, ctx)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  path(land)
  ctx.fill()
  maskData = ctx.getImageData(0, 0, MASK_W, MASK_H).data
}

export function isLand(lat, lon) {
  if (!maskData) buildLandMask()
  const x = Math.min(MASK_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MASK_W)))
  const y = Math.min(MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_H)))
  return maskData[(y * MASK_W + x) * 4 + 3] > 120
}

// Equal-area-ish grid of land points → [{lat, lon}]
export function sampleLandPoints(rows = 210) {
  buildLandMask()
  const pts = []
  const latStep = 180 / rows
  for (let i = 0; i < rows; i++) {
    const lat = -90 + (i + 0.5) * latStep
    if (Math.abs(lat) > 84) continue
    const circ = Math.cos((lat * Math.PI) / 180)
    const n = Math.max(1, Math.round(rows * 2 * circ))
    const lonStep = 360 / n
    for (let j = 0; j < n; j++) {
      const lon = -180 + (j + 0.5) * lonStep + (Math.random() - 0.5) * lonStep * 0.6
      const jlat = lat + (Math.random() - 0.5) * latStep * 0.6
      if (isLand(jlat, lon)) pts.push({ lat: jlat, lon })
    }
  }
  return pts
}

export function haversineKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Flat dotted world map for the prefers-reduced-motion fallback.
export function drawFlatMap(canvas, route, cityDots) {
  buildLandMask()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // fit a 2:1 map inside, slightly padded
  const mw = Math.min(w * 0.92, h * 1.7)
  const mh = mw / 2
  const ox = (w - mw) / 2
  const oy = (h - mh) / 2
  const px = (lon) => ox + ((lon + 180) / 360) * mw
  const py = (lat) => oy + ((90 - lat) / 180) * mh

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(127,160,255,0.55)'
  const pts = sampleLandPoints(110)
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(px(p.lon), py(p.lat), 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  // route
  ctx.strokeStyle = 'rgba(198,242,78,0.9)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([2, 6])
  ctx.beginPath()
  route.forEach((c, i) => {
    if (i === 0) ctx.moveTo(px(c.lon), py(c.lat))
    else ctx.lineTo(px(c.lon), py(c.lat))
  })
  ctx.stroke()
  ctx.setLineDash([])
  for (const c of cityDots) {
    ctx.beginPath()
    ctx.fillStyle = c.accent
    ctx.arc(px(c.lon), py(c.lat), 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
