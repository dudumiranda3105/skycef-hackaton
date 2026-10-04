/* Tipos do que a API devolve (já traduzidos para o que a interface usa). */

export type Papel = 'ADMIN' | 'DIRETORIA' | 'COMPRAS' | 'ARMAZEM' | 'ENCARREGADO' | 'FORNECEDOR' | 'INSUMO' | 'PORTEIRO'
export type Acond = 'BATIDO' | 'PALETIZADO' | 'BIG_BAG'
export type StatusAg =
  | 'PENDENTE_COMPRAS'
  | 'AUTORIZADO'
  | 'NAO_AUTORIZADO'
  | 'EM_DESCARGA'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'NAO_RECEBIDO'
export type Origem = 'HISTORICO' | 'PLATAFORMA'

export interface Eu {
  id: number
  login: string
  nome: string
  papel: Papel
  autenticacaoAtiva: boolean
}

export interface Armazem {
  id: number
  codigo: string
  nome: string
}

export interface Equipamento {
  id: number
  armazemId: number
  identificacao: string
  tipo: string
  observacao?: string | null
}

export interface Fornecedor {
  id: number
  nome: string
  curto: string
  cnpj: string
}

export interface TipoItem {
  codigo: string
  descricao: string
  precoUnitario: string
}

export interface Chapa {
  matricula: string
  nome: string
}

export interface Nota {
  id: number
  numero: string
  chave: string
  arquivo: string
  peso: number | null
  ativa: boolean
}

export interface Descarga {
  id: number
  agId: number
  armazemId: number
  armazem: string
  chegada: string | null
  entrada: string | null
  saida: string | null
  chapas: number | null
  equip: number[]
  origem: string
}

export interface Agendamento {
  id: number
  fornecedorId: number
  data: string
  horario: string
  acond: Acond
  status: StatusAg
  naHora: boolean
  limiteIgnorado: boolean
  origem: string
  criadoEm: string
  chegadaEm: string | null
  placaVeiculo?: string | null
  portariaObrigatoria?: boolean
  portaria?: RecebimentoPortaria | null
  nfs: Nota[]
  compras: { pedido: string | null; decisao: string; obs: string | null } | null
  canc: { motivo: string; situacao: string } | null
  descs: Descarga[]
}

export interface RecebimentoPortaria {
  situacao: 'AGUARDANDO_DOCUMENTOS' | 'PENDENTE_INSUMOS' | 'DIRECIONADO' | 'RECUSADO'
  placa: string
  conferidoEm: string
  enviadoEm: string | null
  decididoEm: string | null
  observacao: string | null
  conferidoPorNome?: string | null
  decididoPorNome?: string | null
}

export interface Vaga {
  id: number
  data: string
  horario: string
  acondicionamento: Acond
  origemAgendamentoId: number
  status: 'ABERTA' | 'ATRIBUIDA' | 'LIBERADA_GERAL'
  atribuidaAAgendamentoId?: number | null
}

export interface NaoRecebimento {
  id: number
  agendamentoId: number | null
  fornecedorId: number | null
  fornecedorNome?: string | null
  data: string
  motivo: string
  descricao?: string | null
  origem: string
}

export interface LinhaBoletim {
  tipoItem: string
  descricao: string
  descarga: number
  remocao: number
  transferencia: number
  quantidadeTotal: number
  precoUnitario: string
  valor: string
}

export interface MembroEquipe {
  matricula: string
  nome: string
  tipoDiaria: 'COMPLETA' | 'MEIA'
}

/** Resultado de um boletim (gravado ou prévia do cálculo). */
export interface ResumoBoletim {
  producao: string
  diarias: string
  vpd: string | null
  total: string | null
  complemento: string | null
  abaixo: boolean | null
  situacao: 'CONSISTENTE' | 'INCONSISTENTE'
  completas: number
  meias: number
  piso: string
}

export interface Boletim {
  id: number
  armazemId: number
  armazem: string
  data: string
  situacao: 'CONSISTENTE' | 'INCONSISTENTE'
  origem: string
  linhas: LinhaBoletim[]
  equipe: MembroEquipe[]
  chapas: number
  completas: number
  meias: number
  diarias: string
  producao: string
  vpd: string | null
  total: string | null
  complemento: string | null
  abaixo: boolean | null
}

export interface Usuario {
  id: number
  login: string
  nome: string
  papel: Papel
  ativo: boolean
  criadoEm?: string
  ultimoAcessoEm?: string
}

export interface Evento {
  id: number
  tipo: string
  observacao?: string
  detalhe?: {
    de?: { data: string; horario: string }
    para?: { data: string; horario: string }
    casoFortuito?: boolean
    limiteExcedido?: boolean
  }
  ocorridoEm: string
}
