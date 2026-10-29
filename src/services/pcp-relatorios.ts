import pb from '@/lib/pocketbase/client'

export interface RodapeRelatorio {
  periodo: { de: string; ate: string }
  fonte: string
  atualizado_em: string | null
  lacunas: string[]
  sem_dados: boolean
}

export interface RelatorioCompras {
  bloco: 'compras'
  por_unidade: { unidade: string; comprado: number; recebido: number }[]
  entregas: {
    com_recebimento: number
    no_prazo: number
    atrasadas: number
    pct_no_prazo: number | null
  }
  preco_medio: {
    fornecedor: string
    unidade: string
    preco_medio: number
    quantidade_base: number
  }[]
  rodape: RodapeRelatorio
}

export interface RelatorioPedidos {
  bloco: 'pedidos'
  confirmados: {
    origem: string
    unidade: string
    total: number
    aptos: number
    bloqueados: number
    liberados: number
  }[]
  intencoes: number
  horas_ate_liberar: { media: number | null; pedidos: number }
  rodape: RodapeRelatorio
}

export interface RelatorioSemFonte {
  bloco: 'producao' | 'consumo'
  linhas: unknown[]
  rodape: RodapeRelatorio
}

export type RelatorioQualquer = RelatorioCompras | RelatorioPedidos | RelatorioSemFonte

export const obterRelatorio = (c: { bloco: string; de: string; ate: string; produto?: string }) =>
  pb.send('/backend/v1/pcp/relatorios', { method: 'GET', query: c }) as Promise<RelatorioQualquer>

/** CSV para planilha: células que começariam como fórmula ganham um apóstrofo. */
export function paraCsv(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const cel = (v: string | number | null) => {
    let s = v === null ? '' : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n')
}
