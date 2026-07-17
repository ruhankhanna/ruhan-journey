// The globe engine: dotted continents, atmosphere, pins, self-drawing arcs and
// a camera that flies great circles between cities. Everything is camera-driven
// (the world never rotates) so lat/lon math stays consistent for pins and arcs.

import * as THREE from 'three'
import { sampleLandPoints } from './geo.js'

const R = 1

export function latLonToVec3(lat, lon, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

function vecToLatLon(v) {
  const n = v.clone().normalize()
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) * 180) / Math.PI
  const lon = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180
  return { lat, lon }
}

function slerpUnit(a, b, t) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
  const theta = Math.acos(dot)
  if (theta < 1e-6) return a.clone()
  const s = Math.sin(theta)
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s)
}

const GLOBE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`
const GLOBE_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.6);
    vec3 base = mix(vec3(0.030, 0.043, 0.118), vec3(0.055, 0.078, 0.20), vNormal.y * 0.5 + 0.5);
    vec3 rim = vec3(0.24, 0.42, 1.0);
    gl_FragColor = vec4(base + rim * fres * 0.55, 1.0);
  }
`
const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 viewDir = normalize(-vViewPos);
    float glow = pow(0.62 - dot(viewDir, normalize(vNormal)), 3.6);
    gl_FragColor = vec4(vec3(0.24, 0.42, 1.0), 1.0) * clamp(glow * 0.8, 0.0, 1.0);
  }
`
const DOTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aRand;
  varying float vRand;
  uniform float uScale;
  void main() {
    vRand = aRand;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const DOTS_FRAG = /* glsl */ `
  varying float vRand;
  uniform float uTime;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.32, d);
    vec3 a = vec3(0.62, 0.72, 1.0);
    vec3 b = vec3(0.86, 0.92, 1.0);
    vec3 col = mix(a, b, vRand);
    float tw = 0.82 + 0.18 * sin(uTime * 0.7 + vRand * 40.0);
    gl_FragColor = vec4(col, alpha * 0.85 * tw);
  }
`
const ARC_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uHead;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  void main() {
    if (vUv.x > uHead) discard;
    float dash = smoothstep(0.35, 0.65, fract(vUv.x * 46.0 - uTime * 1.4));
    float headGlow = smoothstep(uHead - 0.07, uHead, vUv.x);
    vec3 col = mix(uColorA, uColorB, vUv.x);
    float alpha = 0.28 + dash * 0.62 + headGlow;
    gl_FragColor = vec4(col + headGlow * 0.8, min(alpha, 1.0));
  }
`
const ARC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export class Globe {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas
    this.quality = quality
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.maxDpr = quality === 'high' ? 1.75 : 1.4
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr))
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 60)
    this.world = new THREE.Group()
    this.scene.add(this.world)

    // camera state — journey.js tweens this
    this.cam = { lat: 16, lon: 76, dist: 3.5, offX: 0.55, offY: -0.05, drift: 1 }
    this.flight = null // { a, b, d0, d1, bump, t }

    this.pins = new Map()
    this.arcs = new Map()
    this._t0 = performance.now()
    this._fps = { acc: 0, n: 0, checked: false }

    this.#buildSphere()
    this.#buildDots()
    this.#buildStars()
    this.#buildPlane()

    window.addEventListener('resize', () => this.#resize())
    this.renderer.setAnimationLoop(() => this.#tick())
  }

  #buildSphere() {
    const geo = new THREE.SphereGeometry(R * 0.996, 64, 64)
    const mat = new THREE.ShaderMaterial({ vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG })
    this.world.add(new THREE.Mesh(geo, mat))

    const atmoGeo = new THREE.SphereGeometry(R * 1.12, 64, 64)
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: GLOBE_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    this.world.add(new THREE.Mesh(atmoGeo, atmoMat))
  }

  #buildDots() {
    const pts = sampleLandPoints(this.quality === 'high' ? 210 : 140)
    const n = pts.length
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const rand = new Float32Array(n)
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      v.copy(latLonToVec3(pts[i].lat, pts[i].lon, R * 1.001))
      pos[i * 3] = v.x
      pos[i * 3 + 1] = v.y
      pos[i * 3 + 2] = v.z
      size[i] = 0.9 + Math.random() * 0.9
      rand[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    this.dotsMat = new THREE.ShaderMaterial({
      vertexShader: DOTS_VERT,
      fragmentShader: DOTS_FRAG,
      uniforms: {
        uScale: { value: 5.2 * this.renderer.getPixelRatio() },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    })
    this.world.add(new THREE.Points(geo, this.dotsMat))
  }

  #buildStars() {
    const n = 550
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 18)
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0x8fa5e8, size: 0.05, sizeAttenuation: true,
      transparent: true, opacity: 0.6, depthWrite: false,
    })
    this.scene.add(new THREE.Points(geo, mat))
  }

  #buildPlane() {
    // tiny paper plane that rides the arc head
    const shape = new THREE.BufferGeometry()
    // prettier-ignore
    const verts = new Float32Array([
      0, 0.022, 0,   -0.013, -0.014, 0,   0, -0.008, 0.004,
      0, 0.022, 0,    0.013, -0.014, 0,   0, -0.008, 0.004,
    ])
    shape.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4efe2, side: THREE.DoubleSide })
    this.plane = new THREE.Mesh(shape, mat)
    this.plane.visible = false
    this.world.add(this.plane)
  }

  addPin(id, { lat, lon, accent, dim = false }) {
    const group = new THREE.Group()
    const pos = latLonToVec3(lat, lon, R * 1.004)
    group.position.copy(pos)
    const color = new THREE.Color(accent)

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(dim ? 0.008 : 0.012, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dim ? 0.55 : 1 })
    )
    group.add(dot)

    const rings = []
    if (!dim) {
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1, 40),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
          })
        )
        ring.lookAt(pos.clone().multiplyScalar(2))
        ring.position.copy(pos.clone().normalize().multiplyScalar(0.004))
        rings.push({ mesh: ring, phase: i * 0.5 })
        group.add(ring)
      }
    }
    this.world.add(group)
    this.pins.set(id, { group, rings, dim })
    return group
  }

  addArc(key, from, to, colorA, colorB) {
    const a = latLonToVec3(from.lat, from.lon, 1).normalize()
    const b = latLonToVec3(to.lat, to.lon, 1).normalize()
    const theta = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1))
    const alt = 0.14 + 0.24 * (theta / Math.PI)
    const pts = []
    for (let i = 0; i <= 96; i++) {
      const t = i / 96
      const p = slerpUnit(a, b, t).multiplyScalar(R * (1.004 + alt * Math.sin(Math.PI * t)))
      pts.push(p)
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const geo = new THREE.TubeGeometry(curve, 128, 0.0042, 8, false)
    const mat = new THREE.ShaderMaterial({
      vertexShader: ARC_VERT,
      fragmentShader: ARC_FRAG,
      uniforms: {
        uHead: { value: 0 },
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
      },
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    this.world.add(mesh)
    this.arcs.set(key, { mesh, mat, curve })
    return this.arcs.get(key)
  }

  // t: 0..1 along an arc — moves camera, draws arc, flies the paper plane.
  // The camera state (lat/lon/dist) is updated continuously so handoff to
  // static views on either end is seamless.
  setFlight(key, from, to, d0, d1, bump, t) {
    const arc = this.arcs.get(key)
    if (arc) arc.mat.uniforms.uHead.value = t

    const a = latLonToVec3(from.lat, from.lon, 1).normalize()
    const b = latLonToVec3(to.lat, to.lon, 1).normalize()
    const dir = slerpUnit(a, b, t)
    const dist = THREE.MathUtils.lerp(d0, d1, t) + bump * Math.sin(Math.PI * t)
    const { lat, lon } = vecToLatLon(dir)
    this.cam.lat = lat
    this.cam.lon = lon
    this.cam.dist = dist

    if (arc && this.plane) {
      const tt = THREE.MathUtils.clamp(t, 0.001, 0.999)
      const pos = arc.curve.getPointAt(tt)
      const tan = arc.curve.getTangentAt(tt)
      this.plane.position.copy(pos)
      this.plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
      this.plane.visible = t > 0.005 && t < 0.995
      const s = 1 + 0.8 * Math.sin(Math.PI * t)
      this.plane.scale.setScalar(s)
    }
  }

  setView(lat, lon, dist) {
    this.cam.lat = lat
    this.cam.lon = lon
    this.cam.dist = dist
  }

  #resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  #tick() {
    const t = (performance.now() - this._t0) / 1000
    this.dotsMat.uniforms.uTime.value = t
    for (const arc of this.arcs.values()) arc.mat.uniforms.uTime.value = t

    // idle sway (hero only — journey fades cam.drift to 0, and the offset
    // fades with it, so there is never a residual jump when a flight starts)
    const sway = Math.sin(t * 0.2) * 5 * this.cam.drift

    this.camera.position.copy(
      latLonToVec3(this.cam.lat, this.cam.lon + sway, this.cam.dist)
    )
    this.camera.lookAt(0, 0, 0)
    this.world.position.x = this.cam.offX
    this.world.position.y = this.cam.offY

    // pin pulses
    for (const { rings } of this.pins.values()) {
      for (const r of rings) {
        const ph = (t * 0.55 + r.phase) % 1
        r.mesh.scale.setScalar(0.014 + ph * 0.05)
        r.mesh.material.opacity = (1 - ph) * 0.75
      }
    }

    this.renderer.render(this.scene, this.camera)

    // simple fps guard: if we can't hold ~48fps in the first seconds, drop DPR
    if (!this._fps.checked && t > 1 && t < 4) {
      this._fps.acc += 1
      if (t > 3.8) {
        const fps = this._fps.acc / 2.8
        if (fps < 48 && this.renderer.getPixelRatio() > 1.05) {
          this.renderer.setPixelRatio(1)
          this.dotsMat.uniforms.uScale.value = 5.2
        }
        this._fps.checked = true
      }
    }
  }
}
