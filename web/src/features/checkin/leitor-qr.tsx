import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, ScanLine, X } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Erros } from '@/components/comum'
import { errTxt } from '@/lib/api'
import { idDoCodigo } from './util'

/** A leitura localiza uma entrega. A conferência e a autorização continuam no servidor. */
export function LeitorQr({ onLocalizar, ocupado = false }: { onLocalizar: (id: number) => void; ocupado?: boolean }) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [camera, setCamera] = useState(false)
  const [lendoImagem, setLendoImagem] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const controles = useRef<IScannerControls | null>(null)
  const onLocalizarRef = useRef(onLocalizar)
  const geracao = useRef(0)
  onLocalizarRef.current = onLocalizar

  const localizar = (texto: string) => {
    const id = idDoCodigo(texto)
    if (!id) {
      setErro('QR inválido para este sistema. Use o QR desta empresa ou o código completo AG-0001.')
      return false
    }
    setErro('')
    setCamera(false)
    onLocalizarRef.current(id)
    return true
  }
  const localizarRef = useRef(localizar)
  localizarRef.current = localizar

  useEffect(() => {
    if (!camera || !video.current) return
    let ativo = true
    const elemento = video.current
    const parar = () => {
      controles.current?.stop()
      controles.current = null
      const stream = elemento.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop())
      elemento.srcObject = null
    }
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!ativo) return
        const leitor = new BrowserQRCodeReader()
        let finalizou = false
        const c = await leitor.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false }, elemento,
          (resultado, _falha, controle) => {
            if (!ativo || finalizou || !resultado) return
            if (localizarRef.current(resultado.getText())) {
              finalizou = true
              controle.stop()
            }
          },
        )
        if (!ativo || finalizou) c.stop()
        else controles.current = c
      } catch (e) {
        if (ativo) {
          setErro(`Não foi possível abrir a câmera: ${errTxt(e)}. Você pode enviar uma imagem do QR ou digitar o código.`)
          setCamera(false)
        }
        parar()
      }
    })()
    return () => { ativo = false; parar() }
  }, [camera])

  useEffect(() => () => { geracao.current++ }, [])

  async function lerImagem(arquivo?: File) {
    if (!arquivo) return
    if (arquivo.size > 10 * 1024 * 1024) return setErro('A imagem do QR deve ter até 10 MB.')
    const tentativa = ++geracao.current
    setLendoImagem(true)
    setErro('')
    const url = URL.createObjectURL(arquivo)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const resultado = await new BrowserQRCodeReader().decodeFromImageUrl(url)
      if (tentativa === geracao.current) localizar(resultado.getText())
    } catch {
      if (tentativa === geracao.current) setErro('Não encontrei um QR legível nessa imagem. Envie uma foto nítida ou digite o código.')
    } finally {
      URL.revokeObjectURL(url)
      if (tentativa === geracao.current) setLendoImagem(false)
    }
  }

  return (
    <div className="grid gap-3">
      <Field label="QR Code ou código da entrega">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-48 flex-1" value={codigo} placeholder="AG-0001 ou link do QR" disabled={ocupado || lendoImagem} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && !ocupado && !lendoImagem) { e.preventDefault(); localizar(codigo) }
          }} />
          <Button disabled={ocupado || lendoImagem || !codigo.trim()} onClick={() => localizar(codigo)}><ScanLine />Conferir entrega</Button>
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        {!camera ? <Button variant="outline" disabled={ocupado || lendoImagem || !navigator.mediaDevices?.getUserMedia} onClick={() => { setErro(''); setCamera(true) }}><Camera />Ler QR pela câmera</Button>
          : <Button variant="outline" onClick={() => setCamera(false)}><X />Desligar câmera</Button>}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
          {lendoImagem ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} Ler imagem do QR
          <input type="file" accept="image/*" className="sr-only" disabled={ocupado || lendoImagem} onChange={(e) => { void lerImagem(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {camera && <video ref={video} autoPlay playsInline muted aria-label="Câmera para leitura de QR Code" className="w-full max-w-lg rounded-xl border bg-black" />}
      {!navigator.mediaDevices?.getUserMedia && <p className="text-xs text-muted-foreground">Para usar a câmera, abra o site por HTTPS ou localhost. A leitura por imagem e por código está disponível.</p>}
      <Erros>{erro}</Erros>
    </div>
  )
}
