/**
 * Menu por área e tela inicial — SPEC-4-003 (CA-4-11, CA-4-12, CA-4-14).
 *
 * Lista única dos itens do menu (grupo, rótulo, rota, área e ícone), filtro por área, saudação por
 * horário de São Paulo e títulos de tela. Não muda rota, área nem permissão: as áreas são as de antes
 * (Conferências aceita `conferir_expedicao` ou `painel`, como a SPEC-4-001 define). `area` aceita
 * alternativas separadas por "|"; "*" significa qualquer perfil ativo (só o Início).
 * O ícone é o NOME do ícone do `lucide-react`; o layout converte o nome no componente.
 */

export type GrupoMenu =
  | 'Visão geral'
  | 'Produção'
  | 'Compras'
  | 'Recebimento'
  | 'Pedidos e faturamento'
  | 'Gestão'

export interface ItemMenu {
  grupo: GrupoMenu | null
  rotulo: string
  rota: string
  area: string
  icone: string
}

export const ITENS_MENU: ItemMenu[] = [
  { grupo: null, rotulo: 'Início', rota: '/', area: '*', icone: 'House' },
  {
    grupo: 'Visão geral',
    rotulo: 'Painel',
    rota: '/painel',
    area: 'painel',
    icone: 'LayoutDashboard',
  },
  {
    grupo: 'Visão geral',
    rotulo: 'Catálogo',
    rota: '/catalogo',
    area: 'catalogo',
    icone: 'Package',
  },
  {
    grupo: 'Visão geral',
    rotulo: 'Sugestões',
    rota: '/sugestoes',
    area: 'painel',
    icone: 'Lightbulb',
  },
  {
    grupo: 'Visão geral',
    rotulo: 'Sazonalidade',
    rota: '/historico-vendas',
    area: 'painel',
    icone: 'CalendarRange',
  },
  {
    grupo: 'Produção',
    rotulo: 'Planejamento',
    rota: '/planejamento',
    area: 'planejamento',
    icone: 'CalendarClock',
  },
  {
    grupo: 'Produção',
    rotulo: 'Parâmetros',
    rota: '/parametros',
    area: 'planejamento',
    icone: 'SlidersHorizontal',
  },
  {
    grupo: 'Produção',
    rotulo: 'Apontamentos',
    rota: '/apontamentos',
    area: 'apontar_producao',
    icone: 'ClipboardPen',
  },
  {
    grupo: 'Produção',
    rotulo: 'Conferências',
    rota: '/conferencias',
    area: 'conferir_expedicao|painel',
    icone: 'ClipboardCheck',
  },
  {
    grupo: 'Produção',
    rotulo: 'Consolidações',
    rota: '/consolidacoes',
    area: 'painel',
    icone: 'Layers',
  },
  {
    grupo: 'Produção',
    rotulo: 'Qualidade',
    rota: '/qualidade',
    area: 'painel',
    icone: 'BadgeCheck',
  },
  {
    grupo: 'Produção',
    rotulo: 'Envio ao Omie',
    rota: '/envio-omie',
    area: 'painel',
    icone: 'Send',
  },
  {
    grupo: 'Compras',
    rotulo: 'Fornecedores',
    rota: '/fornecedores',
    area: 'compras',
    icone: 'Building2',
  },
  {
    grupo: 'Compras',
    rotulo: 'Conversões',
    rota: '/conversoes',
    area: 'compras',
    icone: 'ArrowLeftRight',
  },
  {
    grupo: 'Compras',
    rotulo: 'Histórico de preços',
    rota: '/compras/historico',
    area: 'compras',
    icone: 'ChartLine',
  },
  {
    grupo: 'Compras',
    rotulo: 'Requisições',
    rota: '/compras/requisicoes',
    area: 'compras',
    icone: 'FileText',
  },
  {
    grupo: 'Compras',
    rotulo: 'Entregas',
    rota: '/compras/entregas',
    area: 'compras',
    icone: 'Truck',
  },
  {
    grupo: 'Recebimento',
    rotulo: 'Recebimentos',
    rota: '/recebimentos',
    area: 'recebimento',
    icone: 'PackageCheck',
  },
  {
    grupo: 'Pedidos e faturamento',
    rotulo: 'Unidades',
    rota: '/unidades',
    area: 'faturamento',
    icone: 'Store',
  },
  {
    grupo: 'Pedidos e faturamento',
    rotulo: 'Preparação de pedidos',
    rota: '/pedidos/preparacao',
    area: 'faturamento',
    icone: 'PackageOpen',
  },
  {
    grupo: 'Pedidos e faturamento',
    rotulo: 'Pedidos manuais',
    rota: '/pedidos/manuais',
    area: 'faturamento',
    icone: 'FilePlus',
  },
  { grupo: 'Gestão', rotulo: 'Alertas', rota: '/alertas', area: 'painel', icone: 'Bell' },
  {
    grupo: 'Gestão',
    rotulo: 'Relatórios',
    rota: '/relatorios',
    area: 'painel',
    icone: 'ChartColumn',
  },
  {
    grupo: 'Gestão',
    rotulo: 'Assistente',
    rota: '/assistente',
    area: 'painel',
    icone: 'MessageSquare',
  },
  { grupo: 'Gestão', rotulo: 'Exportação', rota: '/exportacao', area: 'painel', icone: 'Download' },
]

export const ORDEM_DOS_GRUPOS: GrupoMenu[] = [
  'Visão geral',
  'Produção',
  'Compras',
  'Recebimento',
  'Pedidos e faturamento',
  'Gestão',
]

/** Rotas que não aparecem no menu e a tela de onde se chega a elas. */
export const ROTAS_FORA_DO_MENU: { rota: string; origem: string; rotulo: string }[] = [
  { rota: '/alertas/loop', origem: '/alertas', rotulo: 'Ciclo de revisão dos alertas' },
  { rota: '/parametros/alertas', origem: '/alertas', rotulo: 'Parâmetros dos alertas' },
  { rota: '/assistente/loop', origem: '/assistente', rotulo: 'Ciclo de perguntas do assistente' },
  { rota: '/trocar-senha', origem: 'menu da pessoa', rotulo: 'Trocar senha' },
]

export const MENSAGEM_SEM_ACESSO = 'Seu acesso ainda não foi liberado. Fale com o gestor.'

/** O item aparece para quem tem a área dele (qualquer uma das alternativas). */
export function itemVisivel(item: ItemMenu, areas: string[] | null | undefined): boolean {
  if (item.area === '*') return true
  const minhas = areas ?? []
  return item.area.split('|').some((a) => minhas.includes(a))
}

export interface GrupoVisivel {
  grupo: GrupoMenu
  itens: ItemMenu[]
}

/** Início sempre; grupos só com os itens visíveis; grupo sem item visível não aparece. */
export function menuDaPessoa(areas: string[] | null | undefined): {
  inicio: ItemMenu
  grupos: GrupoVisivel[]
} {
  const inicio = ITENS_MENU[0]
  const grupos: GrupoVisivel[] = []
  for (const g of ORDEM_DOS_GRUPOS) {
    const itens = ITENS_MENU.filter((i) => i.grupo === g && itemVisivel(i, areas))
    if (itens.length > 0) grupos.push({ grupo: g, itens })
  }
  return { inicio, grupos }
}

export const temPainel = (areas: string[] | null | undefined) => (areas ?? []).includes('painel')

/** Grupo da rota aberta (a rota exata ou a mais longa que a contém). */
export function grupoDaRota(pathname: string): GrupoMenu | null {
  const achados = ITENS_MENU.filter(
    (i) => i.grupo && i.rota !== '/' && (pathname === i.rota || pathname.startsWith(i.rota + '/')),
  )
  achados.sort((a, b) => b.rota.length - a.rota.length)
  return achados[0]?.grupo ?? null
}

/** Nome da tela para o cabeçalho. */
export function tituloDaRota(pathname: string): string {
  const exato = ITENS_MENU.filter(
    (i) => pathname === i.rota || (i.rota !== '/' && pathname.startsWith(i.rota + '/')),
  )
  exato.sort((a, b) => b.rota.length - a.rota.length)
  if (exato[0]) return exato[0].rotulo
  const fora = ROTAS_FORA_DO_MENU.find((r) => r.rota === pathname)
  return fora ? fora.rotulo : 'PCP American Goodies'
}

const FUSO = 'America/Sao_Paulo'

/** Hora (0–23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: FUSO,
  }).format(agora)
  return Number(h) % 24
}

/** Bom dia (5h–11h59), Boa tarde (12h–17h59), Boa noite (18h–4h59), pelo horário de São Paulo. */
export function saudacao(agora: Date): string {
  const h = horaEmSaoPaulo(agora)
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Primeiro nome; nome vazio devolve '' (a saudação sai sem nome). */
export function primeiroNome(nome: string | null | undefined): string {
  return (
    String(nome ?? '')
      .trim()
      .split(/\s+/)[0] ?? ''
  )
}

export function saudacaoCompleta(agora: Date, nome: string | null | undefined): string {
  const n = primeiroNome(nome)
  return n ? `${saudacao(agora)}, ${n}` : saudacao(agora)
}

export function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: FUSO,
  }).format(agora)
}
