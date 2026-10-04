import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

/* Cenas 3D com Three.js. Escolha: Three.js entrega 3D de verdade (perspectiva, luz e profundidade), enquanto o
   Anime.js só anima DOM/SVG, o que o Motion já faz. Se o navegador não tiver WebGL, a tela mostra o `fallback`. */

interface Ctx {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  el: HTMLElement
  reduzMovimento: boolean
  /** posição do ponteiro sobre a cena, de -1 a 1 (suaviza sozinha) */
  ponteiro: { x: number; y: number }
}
interface Cena {
  atualizar?: (t: number, dt: number) => void
  rotulos?: () => { x: number; y: number; texto: string; sub?: string; esmaecido?: boolean }[]
}

function descartar(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}

export function Cena3D({
  montar, deps, className, altura = 300, fallback,
}: {
  montar: (c: Ctx) => Cena
  deps: unknown[]
  className?: string
  altura?: number
  fallback?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [falhou, setFalhou] = useState(false)
  const [rotulos, setRotulos] = useState<{ x: number; y: number; texto: string; sub?: string; esmaecido?: boolean }[]>([])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFalhou(true)
      return
    }
    setFalhou(false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    const ponteiro = { x: 0, y: 0 }
    const alvo = { x: 0, y: 0 }
    const cena = montar({ scene, camera, el, reduzMovimento: reduz, ponteiro })

    const ajustar = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || altura
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    ajustar()

    const mover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      alvo.x = ((e.clientX - r.left) / r.width) * 2 - 1
      alvo.y = ((e.clientY - r.top) / r.height) * 2 - 1
    }
    const sair = () => {
      alvo.x = 0
      alvo.y = 0
    }
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerleave', sair)

    let raf = 0
    let ultimo = performance.now()
    let ultimoRotulo = 0
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - ultimo) / 1000)
      ultimo = agora
      ponteiro.x += (alvo.x - ponteiro.x) * Math.min(1, dt * 6)
      ponteiro.y += (alvo.y - ponteiro.y) * Math.min(1, dt * 6)
      cena.atualizar?.(agora / 1000, dt)
      renderer.render(scene, camera)
      if (cena.rotulos && agora - ultimoRotulo > 60) {
        ultimoRotulo = agora
        setRotulos(cena.rotulos())
      }
      raf = requestAnimationFrame(quadro)
    }
    raf = requestAnimationFrame(quadro)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerleave', sair)
      descartar(scene)
      renderer.dispose()
      renderer.domElement.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  if (falhou) return <>{fallback ?? <p className="text-sm text-muted-foreground">O 3D não está disponível neste navegador.</p>}</>
  return (
    <div ref={ref} className={cn('relative w-full select-none', className)} style={{ height: altura }}>
      {rotulos.map((r, i) => (
        <div
          key={i}
          className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-full text-center leading-tight transition-opacity', r.esmaecido && 'opacity-50')}
          style={{ left: r.x, top: r.y }}
        >
          <div className="num text-[12.5px] font-semibold">{r.texto}</div>
          {r.sub && <div className="text-[11.5px] text-muted-foreground">{r.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Colunas 3D (blocos por armazém e sazonalidade) ---------------- */

export interface ItemColuna {
  rotulo: string
  valor: number
  texto: string
  sub?: string
  cor: string
  esmaecida?: boolean
}

const suave = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3)

export function Colunas3D({
  itens, altura = 300, largura = 1, espaco = 1.8, fallback,
}: { itens: ItemColuna[]; altura?: number; largura?: number; espaco?: number; fallback?: ReactNode }) {
  const chave = JSON.stringify(itens)
  return (
    <Cena3D
      altura={altura}
      deps={[chave, largura, espaco]}
      fallback={fallback}
      montar={({ scene, camera, el, reduzMovimento, ponteiro }) => {
        const n = itens.length
        const max = Math.max(1, ...itens.map((i) => i.valor))
        const alturaMax = 3.2
        const total = (n - 1) * espaco + largura
        scene.add(new THREE.AmbientLight(0xffffff, 1.35))
        const luz = new THREE.DirectionalLight(0xffffff, 2.2)
        luz.position.set(4, 8, 6)
        scene.add(luz)
        const grupo = new THREE.Group()
        scene.add(grupo)
        const chao = new THREE.Mesh(
          new THREE.BoxGeometry(total + 1.6, 0.06, largura + 1.4),
          new THREE.MeshStandardMaterial({ color: 0x8aa1ba, transparent: true, opacity: 0.22 }),
        )
        chao.position.y = -0.03
        grupo.add(chao)
        const caixas = itens.map((it, i) => {
          const h = Math.max(0.12, (it.valor / max) * alturaMax)
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(largura, 1, largura),
            new THREE.MeshStandardMaterial({ color: it.cor, transparent: true, opacity: it.esmaecida ? 0.45 : 1, roughness: 0.55 }),
          )
          m.position.x = i * espaco - (total - largura) / 2
          grupo.add(m)
          return { m, h }
        })
        camera.position.set(0, 3.4, Math.max(8.5, total * 1.15))
        camera.lookAt(0, 1.3, 0)
        const inicio = performance.now()
        const v = new THREE.Vector3()
        let k = reduzMovimento ? 1 : 0
        return {
          atualizar: () => {
            if (!reduzMovimento) k = suave((performance.now() - inicio) / 900)
            caixas.forEach(({ m, h }, i) => {
              const kk = reduzMovimento ? 1 : suave(((performance.now() - inicio) / 900) - i * 0.04)
              m.scale.y = Math.max(0.001, h * kk)
              m.position.y = (h * kk) / 2
            })
            grupo.rotation.y = -0.42 + ponteiro.x * 0.28
            grupo.rotation.x = ponteiro.y * 0.06
          },
          rotulos: () => {
            const w = el.clientWidth
            const hh = el.clientHeight
            grupo.updateMatrixWorld(true)
            return caixas.map(({ m, h }, i) => {
              v.set(m.position.x, h * k + 0.12, 0)
              grupo.localToWorld(v)
              v.project(camera)
              return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * hh, texto: itens[i].texto, sub: itens[i].sub, esmaecido: itens[i].esmaecida }
            })
          },
        }
      }}
    />
  )
}

/* ---------------- Logotipo em 3D (as três faixas da marca) ---------------- */
export function Logo3D({ tamanho = 140, className }: { tamanho?: number; className?: string }) {
  return (
    <Cena3D
      altura={tamanho}
      className={className}
      deps={[tamanho]}
      fallback={
        <svg width={tamanho * 0.5} height={tamanho * 0.5} viewBox="0 0 34 34" aria-hidden>
          <rect x="3" y="5" width="28" height="7" rx="2" fill="#FFC81F" />
          <rect x="3" y="14" width="28" height="7" rx="2" fill="#2E9B4B" />
          <rect x="3" y="23" width="28" height="7" rx="2" fill="#0B4F9E" />
        </svg>
      }
      montar={({ scene, camera, reduzMovimento, ponteiro }) => {
        scene.add(new THREE.AmbientLight(0xffffff, 1.5))
        const luz = new THREE.DirectionalLight(0xffffff, 2.4)
        luz.position.set(3, 5, 6)
        scene.add(luz)
        const grupo = new THREE.Group()
        scene.add(grupo)
        const cores = [0xffc81f, 0x2e9b4b, 0x2f7fd6]
        cores.forEach((c, i) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.62, 1.5), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.1 }))
          m.position.y = (1 - i) * 0.9
          grupo.add(m)
        })
        camera.position.set(0, 0.6, 7)
        camera.lookAt(0, 0, 0)
        return {
          atualizar: (t) => {
            grupo.rotation.y = (reduzMovimento ? -0.5 : Math.sin(t * 0.6) * 0.5 - 0.3) + ponteiro.x * 0.5
            grupo.rotation.x = 0.18 + ponteiro.y * 0.2
            grupo.children.forEach((c, i) => {
              c.position.y = (1 - i) * 0.9 + (reduzMovimento ? 0 : Math.sin(t * 1.4 + i) * 0.05)
            })
          },
        }
      }}
    />
  )
}
