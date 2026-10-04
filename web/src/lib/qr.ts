/* Gerador de QR Code (modo byte, correção M, versões 1 a 10), sem dependências: funciona offline.
   Validado lendo de volta o texto de QRs das versões 1 a 10 com um decodificador independente. */

const ECC_POR_BLOCO = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] // nível M, índice = versão
const BLOCOS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0

function modulosBrutos(v: number) {
  let r = (16 * v + 128) * v + 64
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (v >= 7) r -= 36
  }
  return r
}
const capacidadeDados = (v: number) => Math.floor(modulosBrutos(v) / 8) - ECC_POR_BLOCO[v] * BLOCOS[v]

/* Reed-Solomon sobre GF(256), polinômio 0x11D */
function mulGf(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 255
}
function geradorRs(grau: number) {
  const r = new Array<number>(grau).fill(0)
  r[grau - 1] = 1
  let raiz = 1
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = mulGf(r[j], raiz)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    raiz = mulGf(raiz, 0x02)
  }
  return r
}
function restoRs(dados: number[], gerador: number[]) {
  const r = gerador.map(() => 0)
  for (const b of dados) {
    const f = b ^ (r.shift() as number)
    r.push(0)
    gerador.forEach((c, i) => {
      r[i] ^= mulGf(c, f)
    })
  }
  return r
}

function codificarDados(texto: string, v: number) {
  const bytes = Array.from(new TextEncoder().encode(texto))
  const bits: number[] = []
  const poe = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  poe(4, 4)
  poe(bytes.length, v <= 9 ? 8 : 16)
  bytes.forEach((b) => poe(b, 8))
  const cap = capacidadeDados(v) * 8
  poe(0, Math.min(4, cap - bits.length))
  poe(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) poe(pad, 8)
  const dados: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    dados.push(b)
  }
  return dados
}

function intercalar(dados: number[], v: number) {
  const nb = BLOCOS[v]
  const eccLen = ECC_POR_BLOCO[v]
  const bruto = Math.floor(modulosBrutos(v) / 8)
  const curtos = nb - (bruto % nb)
  const lenCurto = Math.floor(bruto / nb)
  const ger = geradorRs(eccLen)
  const blocos: number[][] = []
  for (let i = 0, k = 0; i < nb; i++) {
    const d = dados.slice(k, k + lenCurto - eccLen + (i < curtos ? 0 : 1))
    k += d.length
    const e = restoRs(d, ger)
    if (i < curtos) d.push(0)
    blocos.push(d.concat(e))
  }
  const out: number[] = []
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => {
      if (i !== lenCurto - eccLen || j >= curtos) out.push(b[i])
    })
  }
  return out
}

function criarMatriz(v: number, codewords: number[]) {
  const tam = v * 4 + 17
  const mod = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false))
  const fun = Array.from({ length: tam }, () => new Array<boolean>(tam).fill(false))
  const set = (x: number, y: number, d: boolean) => {
    mod[y][x] = d
    fun[y][x] = true
  }
  for (let i = 0; i < tam; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < tam && yy >= 0 && yy < tam) set(xx, yy, d !== 2 && d !== 4)
      }
    }
  }
  finder(3, 3)
  finder(tam - 4, 3)
  finder(3, tam - 4)
  const pos: number[] = []
  if (v > 1) {
    const n = Math.floor(v / 7) + 2
    const passo = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
    pos.push(6)
    for (let p = tam - 7; pos.length < n; p -= passo) pos.splice(1, 0, p)
  }
  pos.forEach((a, i) =>
    pos.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }),
  )
  const formato = (mask: number) => {
    const dados = (0 << 3) | mask
    let r = dados
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    const bits = ((dados << 10) | r) ^ 0x5412
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i))
    set(8, 7, bit(bits, 6))
    set(8, 8, bit(bits, 7))
    set(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i))
    for (let i = 0; i < 8; i++) set(tam - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) set(8, tam - 15 + i, bit(bits, i))
    set(8, tam - 8, true)
  }
  formato(0)
  if (v >= 7) {
    let r = v
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const bits = (v << 12) | r
    for (let i = 0; i < 18; i++) {
      const c = bit(bits, i)
      const a = tam - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, c)
      set(b, a, c)
    }
  }
  let k = 0
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5
    for (let vert = 0; vert < tam; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j
        const sobe = ((dir + 1) & 2) === 0
        const y = sobe ? tam - 1 - vert : vert
        if (!fun[y][x] && k < codewords.length * 8) {
          mod[y][x] = bit(codewords[k >>> 3], 7 - (k & 7))
          k++
        }
      }
    }
  }
  const aplicar = (mask: number) => {
    for (let y = 0; y < tam; y++) {
      for (let x = 0; x < tam; x++) {
        let inv: boolean
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break
          case 1: inv = y % 2 === 0; break
          case 2: inv = x % 3 === 0; break
          case 3: inv = (x + y) % 3 === 0; break
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: inv = ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0; break
          default: inv = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0
        }
        if (!fun[y][x] && inv) mod[y][x] = !mod[y][x]
      }
    }
  }
  const penalidade = () => {
    let p = 0
    const linhas: boolean[][] = []
    for (let i = 0; i < tam; i++) {
      linhas.push(mod[i].slice())
      linhas.push(mod.map((r) => r[i]))
    }
    linhas.forEach((L) => {
      let run = 1
      for (let i = 1; i <= tam; i++) {
        if (i < tam && L[i] === L[i - 1]) run++
        else {
          if (run >= 5) p += 3 + run - 5
          run = 1
        }
      }
      const s = L.map((c) => (c ? '1' : '0')).join('')
      for (const _ of s.matchAll(/(?=(10111010000|00001011101))/g)) p += 40
    })
    for (let y = 0; y < tam - 1; y++) {
      for (let x = 0; x < tam - 1; x++) {
        const c = mod[y][x]
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3
      }
    }
    const escuros = mod.reduce((t, r) => t + r.filter(Boolean).length, 0)
    p += 10 * Math.floor(Math.abs((escuros * 100) / (tam * tam) - 50) / 5)
    return p
  }
  let melhor = 0
  let menor = Infinity
  for (let m = 0; m < 8; m++) {
    aplicar(m)
    formato(m)
    const pe = penalidade()
    if (pe < menor) {
      menor = pe
      melhor = m
    }
    aplicar(m)
  }
  aplicar(melhor)
  formato(melhor)
  return mod
}

export function qrMatriz(texto: string): boolean[][] {
  const n = new TextEncoder().encode(texto).length
  let v = 1
  while (v <= 10 && capacidadeDados(v) * 8 < 4 + (v <= 9 ? 8 : 16) + n * 8) v++
  if (v > 10) throw new Error('Texto longo demais para o QR Code.')
  return criarMatriz(v, intercalar(codificarDados(texto, v), v))
}

/** Devolve o <svg> do QR (fundo branco, módulos pretos: lê bem em qualquer tema). */
export function qrSvg(texto: string, margem = 4): { path: string; lado: number } {
  const m = qrMatriz(texto)
  const n = m.length
  let d = ''
  m.forEach((r, y) =>
    r.forEach((c, x) => {
      if (c) d += `M${x + margem},${y + margem}h1v1h-1z`
    }),
  )
  return { path: d, lado: n + margem * 2 }
}
