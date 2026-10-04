import type { Acond, Papel, StatusAg } from './types'

export const SLOTS = ['08:00', '10:00', '13:00', '15:00'] as const
export const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const DOW_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const ACOND: Record<Acond, { nome: string; chapas: number; desc: string; cor: string }> = {
  BATIDO: { nome: 'Batido', chapas: 5, desc: 'Ocupa o horário inteiro', cor: '#e9a800' },
  PALETIZADO: { nome: 'Paletizado', chapas: 2, desc: 'Até 2 caminhões por horário', cor: '#005ba0' },
  BIG_BAG: { nome: 'Big bag', chapas: 2, desc: 'Até 2 caminhões por horário', cor: '#4cb033' },
}

export const MOTIVOS_NR: Record<string, string> = {
  DIVERGENCIA_NF_PEDIDO: 'Divergência entre NF e pedido',
  SEM_AGENDAMENTO_SEM_VAGA: 'Chegou sem agendamento e sem vaga',
  CASO_FORTUITO: 'Caso fortuito',
  OUTRO: 'Outro',
  ATRASO_AGENDAMENTO: 'Perda da agenda por atraso de 30 minutos ou mais',
}

export const STATUS: Record<StatusAg, string> = {
  PENDENTE_COMPRAS: 'Aguardando Compras',
  AUTORIZADO: 'Autorizado',
  NAO_AUTORIZADO: 'Não autorizado',
  EM_DESCARGA: 'Descarregando',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  NAO_RECEBIDO: 'Não recebido',
}

export type Tom = 'neutro' | 'ok' | 'aviso' | 'ruim' | 'info'
export const STATUS_TOM: Record<StatusAg, Tom> = {
  PENDENTE_COMPRAS: 'aviso',
  AUTORIZADO: 'info',
  NAO_AUTORIZADO: 'ruim',
  EM_DESCARGA: 'info',
  CONCLUIDO: 'ok',
  CANCELADO: 'neutro',
  NAO_RECEBIDO: 'ruim',
}

/** Estes status liberam a vaga do horário (mesma regra da API). */
export const LIBERAM_VAGA: StatusAg[] = ['CANCELADO', 'NAO_AUTORIZADO', 'NAO_RECEBIDO']
export const TOLERANCIA_MIN = 15
export const PERDA_AGENDAMENTO_MIN = 30
export const MAX_UNITIZADOS = 2
export const MAX_CHAPAS_BOLETIM = 20
export const PISO_PADRAO = '90.1731'

export const ORDEM_TIPOS = [
  'SACARIA_MALAS_25', 'SACARIA_MALAS_40', 'SACARIA_MALAS_50', 'SACARIA_FARDO_250', 'SACARIA_FARDO_500',
  'PECAS', 'MAQUINAS', 'AGROQUIMICO', 'FERTILIZANTES', 'SEMENTES', 'MEDICAMENTOS', 'ALIMENTACAO_ANIMAL',
  'ACESSORIOS', 'SERVICOS_DIVERSOS',
]

export const PAPEL_ROTULO: Record<Papel, string> = {
  ADMIN: 'Administrador',
  DIRETORIA: 'Diretoria',
  COMPRAS: 'Compras',
  ARMAZEM: 'Responsável pelo armazém',
  ENCARREGADO: 'Encarregado dos chapas',
  FORNECEDOR: 'Fornecedor',
  INSUMO: 'Setor de Insumo',
  PORTEIRO: 'Porteiro',
}

export type Secao =
  | 'agenda' | 'portaria' | 'compras' | 'armazem' | 'insumo' | 'fiscal' | 'boletim' | 'painel' | 'd1' | 'perguntar' | 'qualidade' | 'usuarios'

/** Seções que cada perfil enxerga (espelha o que a API deixa cada um chamar). */
export const PAPEL_SECOES: Record<Papel, Secao[]> = {
  ADMIN: ['agenda', 'portaria', 'compras', 'armazem', 'insumo', 'fiscal', 'boletim', 'painel', 'd1', 'perguntar', 'qualidade', 'usuarios'],
  DIRETORIA: ['agenda', 'boletim', 'painel', 'd1', 'perguntar', 'qualidade'],
  COMPRAS: ['agenda', 'compras', 'fiscal'],
  ARMAZEM: ['agenda', 'armazem', 'fiscal', 'boletim', 'painel', 'd1', 'perguntar', 'qualidade'],
  ENCARREGADO: ['agenda', 'boletim'],
  FORNECEDOR: ['agenda'],
  INSUMO: ['agenda', 'armazem', 'insumo', 'fiscal'],
  PORTEIRO: ['portaria', 'agenda'],
}

/** Grupos de gravação (mesma divisão de Permissoes.java). */
export type Grupo = 'agendar' | 'armazem' | 'compras' | 'boletim'
export const GRUPOS: Record<Grupo, Papel[]> = {
  agendar: ['ADMIN', 'FORNECEDOR', 'ARMAZEM', 'PORTEIRO'],
  armazem: ['ADMIN', 'ARMAZEM'],
  compras: ['ADMIN', 'COMPRAS'],
  boletim: ['ADMIN', 'ENCARREGADO', 'ARMAZEM'],
}

export const SECAO_ROTULO: Record<Secao, string> = {
  agenda: 'Agenda',
  portaria: 'Portaria',
  compras: 'Compras',
  armazem: 'Armazém',
  insumo: 'Insumos · validar recebimentos',
  fiscal: 'Notas fiscais históricas',
  boletim: 'Boletim diário',
  painel: 'Painel gerencial',
  d1: 'Planejamento D-1',
  perguntar: 'Pergunte aos dados',
  qualidade: 'Qualidade dos dados',
  usuarios: 'Usuários',
}
