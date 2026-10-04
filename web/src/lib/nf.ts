/* Leitura assistida da Nota Fiscal.
   Lê o XML ou o PDF (com texto) da NF-e e sugere número, chave, emitente, itens, peso e volumes. O resultado
   sempre passa por confirmação ou correção humana. Não aprova a entrega e não substitui a validação NF × pedido de
   Compras. Limite honesto: imagem escaneada exigiria um motor de OCR, que não vai embutido. */

export interface NotaLida {
  fonte: 'XML' | 'PDF'
  numero: string
  chave: string
  emitCnpj: string
  emitNome: string
  itens: { desc: string; qtd: string; un: string }[]
  volumes: number
  peso: string
  pesoTipo: string
  extras?: string
}

/** Chave de acesso: 44 dígitos com dígito verificador (módulo 11). */
export function chaveValida(c: string) {
  if (!/^\d{44}$/.test(c)) return false
  let s = 0
  let p = 2
  for (let i = 42; i >= 0; i--) {
    s += Number(c[i]) * p
    p = p === 9 ? 2 : p + 1
  }
  const r = s % 11
  const dv = r < 2 ? 0 : 11 - r
  return dv === Number(c[43])
}

/** A própria chave carrega UF, mês/ano, CNPJ do emitente, modelo, série e número da nota. */
export const dadosDaChave = (c: string) => ({
  uf: c.slice(0, 2),
  aamm: c.slice(2, 6),
  cnpj: c.slice(6, 20),
  modelo: c.slice(20, 22),
  serie: String(Number(c.slice(22, 25))),
  numero: String(Number(c.slice(25, 34))),
})

/* ---------- XML da NF-e ---------- */
export function lerXmlNfe(txt: string): NotaLida {
  const doc = new DOMParser().parseFromString(txt, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('O arquivo não é um XML válido.')
  const ns = (el: Element | Document, n: string) => el.getElementsByTagNameNS('*', n)
  const t = (el: Element | Document, n: string) => (ns(el, n)[0]?.textContent ?? '').trim()
  const inf = ns(doc, 'infNFe')[0]
  if (!inf) throw new Error('O XML não parece uma NF-e (não achei o grupo infNFe).')
  const chave = (t(doc, 'chNFe') || (inf.getAttribute('Id') || '')).replace(/\D/g, '').slice(-44)
  const emit = ns(doc, 'emit')[0]
  const itens = [...ns(doc, 'det')].map((d) => ({ desc: t(d, 'xProd'), qtd: t(d, 'qCom'), un: t(d, 'uCom') })).filter((i) => i.desc)
  const volumes = [...ns(doc, 'vol')].reduce((s, v) => s + (Number(t(v, 'qVol')) || 0), 0)
  const pesoB = t(doc, 'pesoB')
  const pesoL = t(doc, 'pesoL')
  return {
    fonte: 'XML',
    numero: t(inf, 'nNF'),
    chave: /^\d{44}$/.test(chave) ? chave : '',
    emitCnpj: emit ? t(emit, 'CNPJ') : '',
    emitNome: emit ? t(emit, 'xNome') : '',
    itens,
    volumes,
    peso: pesoB || pesoL || '',
    pesoTipo: pesoB ? 'bruto' : pesoL ? 'líquido' : '',
  }
}

/* ---------- PDF (somente texto) ---------- */
const bytesParaTexto = (u8: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192) as unknown as number[])
  return s
}
async function inflar(u8: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate')
  const w = ds.writable.getWriter()
  w.closed.catch(() => {})
  w.write(u8 as unknown as BufferSource).catch(() => {})
  w.close().catch(() => {})
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}
/** O fim do fluxo tem quebra de linha antes de endstream: tenta o tamanho exato e depois sem 1 ou 2 bytes finais. */
async function inflarSeguro(u8: Uint8Array) {
  for (const corte of [0, 1, 2]) {
    try {
      return await inflar(u8.subarray(0, u8.length - corte))
    } catch {
      /* tenta o próximo corte */
    }
  }
  throw new Error('fluxo comprimido ilegível')
}
interface ObjPdf {
  dict: string
  data: string | null
}
async function objetosPdf(u8: Uint8Array) {
  const s = bytesParaTexto(u8)
  const objs = new Map<number, ObjPdf>()
  const re = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g
  const pend: Promise<void>[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const id = Number(m[1])
    const corpo = m[2]
    const si = corpo.indexOf('stream')
    if (si < 0) {
      objs.set(id, { dict: corpo, data: null })
      continue
    }
    const dict = corpo.slice(0, si)
    let ini = m.index + m[0].indexOf(corpo) + si + 6
    if (u8[ini] === 13) ini++
    if (u8[ini] === 10) ini++
    const fim = s.indexOf('endstream', ini)
    const bruto = u8.subarray(ini, fim)
    const o: ObjPdf = { dict, data: null }
    objs.set(id, o)
    if (/FlateDecode/.test(dict)) {
      pend.push(
        inflarSeguro(bruto)
          .then((d) => {
            o.data = bytesParaTexto(d)
          })
          .catch(() => {}),
      )
    } else o.data = bytesParaTexto(bruto)
  }
  await Promise.all(pend)
  // objetos comprimidos (PDF 1.5+)
  for (const [, o] of [...objs]) {
    if (o.data && /\/Type\s*\/ObjStm/.test(o.dict)) {
      const n = Number(o.dict.match(/\/N\s+(\d+)/)?.[1])
      const first = Number(o.dict.match(/\/First\s+(\d+)/)?.[1])
      const nums = (o.data.slice(0, first).match(/\d+/g) || []).map(Number)
      for (let i = 0; i < n; i++) {
        const id = nums[i * 2]
        const off = nums[i * 2 + 1]
        const fim = i + 1 < n ? nums[(i + 1) * 2 + 1] : o.data.length - first
        objs.set(id, { dict: o.data.slice(first + off, first + fim), data: null })
      }
    }
  }
  return objs
}
type Cmap = Map<number, string> & { bytes?: number }
function lerCmap(t: string | null): Cmap {
  const map: Cmap = new Map()
  if (!t) return map
  for (const bc of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of bc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(p[1], 16), p[2])
  }
  for (const br of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of br[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const a = parseInt(p[1], 16)
      const e = parseInt(p[2], 16)
      const u = parseInt(p[3], 16)
      for (let i = a; i <= e; i++) map.set(i, (u + i - a).toString(16).padStart(4, '0'))
    }
  }
  const cs = t.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/)
  map.bytes = cs ? cs[1].length / 2 : 1
  return map
}
function decodificaTexto(bytesStr: string, cmap: Cmap | null) {
  if (!cmap || !cmap.size) return bytesStr
  const n = cmap.bytes || 1
  let out = ''
  for (let i = 0; i + n <= bytesStr.length; i += n) {
    let c = 0
    for (let j = 0; j < n; j++) c = c * 256 + bytesStr.charCodeAt(i + j)
    const u = cmap.get(c)
    if (u) for (let k = 0; k + 3 < u.length; k += 4) out += String.fromCharCode(parseInt(u.slice(k, k + 4), 16))
  }
  return out
}
const hexParaBytes = (h: string) => {
  h = h.replace(/\s+/g, '')
  if (h.length % 2) h += '0'
  let s = ''
  for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16))
  return s
}
const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
const unescapePdf = (s: string) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, c: string) => escapes[c] ?? String.fromCharCode(parseInt(c, 8)))

async function textoDoPdf(buf: ArrayBuffer) {
  const u8 = new Uint8Array(buf)
  if (bytesParaTexto(u8.subarray(0, 5)) !== '%PDF-') throw new Error('O arquivo não é um PDF.')
  const objs = await objetosPdf(u8)
  const cmaps = new Map<number, Cmap>()
  const nomeFonte = new Map<string, number>()
  for (const [id, o] of objs) {
    if (/\/Type\s*\/Font\b/.test(o.dict)) {
      const m = o.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)
      const alvo = m ? objs.get(Number(m[1])) : undefined
      if (alvo) cmaps.set(id, lerCmap(alvo.data))
    }
    for (const m of o.dict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) if (!nomeFonte.has(m[1])) nomeFonte.set(m[1], Number(m[2]))
  }
  let texto = ''
  const tok = /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>|\b(TJ|Tj|ET)\b|(-?\d+\.?\d*)/g
  for (const [, o] of objs) {
    if (!o.data || !/\bTf\b/.test(o.data) || !/\bT[jJ]\b/.test(o.data)) continue
    let cmap: Cmap | null = null
    let linha = ''
    tok.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = tok.exec(o.data))) {
      if (m[1] !== undefined) cmap = cmaps.get(nomeFonte.get(m[1]) as number) ?? null
      else if (m[2] !== undefined) linha += decodificaTexto(unescapePdf(m[2]), cmap)
      else if (m[3] !== undefined) linha += decodificaTexto(hexParaBytes(m[3]), cmap)
      else if (m[4] !== undefined) {
        texto += linha + ' '
        linha = ''
      } else if (m[5] !== undefined && Number(m[5]) < -200 && linha) linha += ' '
    }
    texto += '\n'
  }
  return texto
}
function chavesNoTexto(texto: string) {
  const achadas: string[] = []
  for (const run of texto.matchAll(/\d[\d\s]{40,90}\d/g)) {
    const d = run[0].replace(/\s+/g, '')
    for (let i = 0; i + 44 <= d.length; i++) {
      const c = d.slice(i, i + 44)
      if (c.slice(20, 22) === '55' && chaveValida(c) && !achadas.includes(c)) achadas.push(c)
    }
  }
  return achadas
}
export async function lerPdfNfe(file: File): Promise<NotaLida> {
  const chaves = chavesNoTexto(await textoDoPdf(await file.arrayBuffer()))
  if (!chaves.length) {
    throw new Error(
      'Não encontrei a chave de acesso no PDF. Se ele for uma imagem escaneada, a leitura automática não funciona: preencha os dados manualmente.',
    )
  }
  const c = chaves[0]
  const d = dadosDaChave(c)
  return {
    fonte: 'PDF', numero: d.numero, chave: c, emitCnpj: d.cnpj, emitNome: '', itens: [], volumes: 0, peso: '', pesoTipo: '',
    extras: chaves.length > 1 ? `${chaves.length} chaves no PDF; usei a primeira` : undefined,
  }
}

export async function lerNota(file: File): Promise<NotaLida> {
  if (!/\.(xml|pdf)$/i.test(file.name)) throw new Error('Use um arquivo .xml ou .pdf.')
  return /\.xml$/i.test(file.name) ? lerXmlNfe(await file.text()) : lerPdfNfe(file)
}
