/**
 * Planejamento com parâmetros e calendário aprovados — SPEC-4-001, CA-4-01.
 *
 * Camada pura entre a tela de Planejamento e as rotas /backend/v1/pcp/producao/*: transforma a versão
 * aprovada dos parâmetros (GET /backend/v1/pcp/parametros) nos recursos e no calendário que o
 * `planejamento.ts` usa para validar o rascunho, decide se "Publicar" fica habilitado e traduz as
 * respostas do servidor. A conta de capacidade continua no `planejamento.ts`; o servidor guarda o que a
 * tela validou. Nenhuma constante de demonstração.
 */
import type { Calendario, ParametrosProducao, Recurso } from './planejamento.ts'

export const MENSAGEM_SEM_PARAMETROS = 'Parâmetros e calendário de produção ainda não aprovados'

export interface RecursoAprovado {
  nome: string
  unidade: string | null
  capacidade_fracao: number
  capacidade_por_produto?: Record<string, number>
  /** Dias da semana em que o recurso produz (0 = domingo ... 6 = sábado). */
  dias_producao?: number[] | null
}

export interface ParametrosAprovados {
  capacidade_padrao: number | null
  lote_multiplo: number | null
  horizonte_dias: number | null
  recursos: RecursoAprovado[]
}

export type SituacaoPublicar =
  | { pode: true; parametros: ParametrosProducao; recursos: Record<string, Recurso> }
  | { pode: false; motivo: string }

/** "Publicar" só habilita com versão aprovada, valores completos e calendário (dias) em todo recurso. */
export function situacaoPublicar(p: ParametrosAprovados | null | undefined): SituacaoPublicar {
  const negar = { pode: false, motivo: MENSAGEM_SEM_PARAMETROS } as const
  if (!p) return negar
  const cap = p.capacidade_padrao
  if (!(cap !== null && cap > 0)) return negar
  if (!(p.lote_multiplo !== null && p.lote_multiplo > 0)) return negar
  if (!(p.horizonte_dias !== null && p.horizonte_dias > 0)) return negar
  if (!Array.isArray(p.recursos) || p.recursos.length === 0) return negar
  const recursos: Record<string, Recurso> = {}
  for (const r of p.recursos) {
    const dias = r.dias_producao
    if (!r.unidade || !(r.capacidade_fracao > 0) || !Array.isArray(dias) || dias.length === 0)
      return negar
    recursos[r.nome] = {
      nome: r.nome,
      unidade: r.unidade,
      capacidade_fracao: r.capacidade_fracao,
      capacidade_por_produto: r.capacidade_por_produto ?? {},
    }
  }
  return {
    pode: true,
    parametros: {
      capacidade_padrao: cap,
      lote_multiplo: p.lote_multiplo,
      horizonte_dias: p.horizonte_dias,
    },
    recursos,
  }
}

const diaDaSemana = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const somaDias = (iso: string, n: number) =>
  new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)

/** Calendário do horizonte aprovado: cada dia lista os recursos que produzem naquele dia da semana. */
export function calendarioDosParametros(p: ParametrosAprovados, inicio: string): Calendario {
  const dias: Calendario['dias'] = []
  const n = p.horizonte_dias ?? 0
  for (let i = 0; i < n; i++) {
    const data = somaDias(inicio, i)
    const ds = diaDaSemana(data)
    const recursos = p.recursos
      .filter((r) => (r.dias_producao ?? []).includes(ds))
      .map((r) => r.nome)
    dias.push({ data, recursos, exclusivo: false })
  }
  return { dias, banner: 'demonstracao' }
}

/** Resposta do servidor à publicação, em texto provisório (a SPEC-4-004 centraliza os textos). */
export function mensagemDaPublicacao(
  http: number,
  corpo: { versao?: number; erro?: string; versao_atual?: number } | null,
): { ok: boolean; recarregar: boolean; texto: string } {
  if (http === 200)
    return {
      ok: true,
      recarregar: true,
      texto: 'Programação publicada: versão ' + (corpo?.versao ?? '') + '.',
    }
  if (http === 409)
    return {
      ok: false,
      recarregar: true,
      texto:
        'Outra pessoa publicou antes: a versão ' +
        (corpo?.versao_atual ?? '') +
        ' foi carregada. Confira e publique de novo.',
    }
  if (http === 422)
    return {
      ok: false,
      recarregar: false,
      texto: 'A programação tem linha inválida: corrija e publique de novo.',
    }
  return { ok: false, recarregar: false, texto: 'Você não tem acesso para publicar a programação.' }
}
