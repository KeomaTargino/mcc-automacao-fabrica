import pb from '@/lib/pocketbase/client'

export interface CicloVenda {
  periodo: string
  ano: number
  quantidade: number | null
  cobertura_pct: number
  lido: boolean
  indice_sobre_media_pct: number | null
}

export interface RespostaHistoricoVendas {
  produto: string
  periodo_atual: string
  atual: { quantidade: number | null; lido: boolean }
  ciclos: CicloVenda[]
  variacao_sobre_anos_anteriores_pct: number | null
  sazonalidade_pct: number | null
  suficiente: boolean
  mensagem: string
  regra: {
    versao: number
    aprovador: string
    ciclosMinimos: number
    coberturaMinimaPct: number
  } | null
  prazo_fornecedor_dias: number | null
  antecipacao: { sugerir: boolean; data_sugerida_de_compra: string | null; texto: string }
  meses_lidos: number
  pode_editar_regra: boolean
}

const BASE = '/backend/v1/pcp'

export const obterHistoricoVendas = (c: {
  produto: string
  periodo?: string
  data_necessaria?: string
}) =>
  pb.send(`${BASE}/vendas/historico`, {
    method: 'GET',
    query: c,
  }) as Promise<RespostaHistoricoVendas>

export const aprovarRegraSazonalidade = (c: {
  ciclos_minimos: number
  cobertura_minima_pct: number
}) => pb.send(`${BASE}/vendas/regra`, { method: 'POST', body: c }) as Promise<any>

export const carregarMesDeVendas = (periodo: string) =>
  pb.send(`${BASE}/vendas/carregar`, { method: 'POST', body: { periodo } }) as Promise<any>

/** Aceitar a sugestão leva à requisição (SPEC-3-005); nada é comprado. */
export const levarAntecipacaoParaRequisicao = (c: {
  produto: string
  periodo: string
  quantidade_estoque: number
  data_necessaria: string
}) =>
  pb.send(`${BASE}/compras/requisicoes`, {
    method: 'POST',
    body: {
      necessidades: [
        {
          origem: `antecipacao:${c.produto}:${c.periodo}`,
          item: c.produto,
          fornecedor: '',
          quantidade_estoque: c.quantidade_estoque,
          data_necessaria: c.data_necessaria,
        },
      ],
    },
  }) as Promise<any>
