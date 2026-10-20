/**
 * Contrato de produção no Omie — SPEC-2-005 (task a2a4ccf1), recorte REAL.
 *
 * Contrato comprovado na conta por sondas de LEITURA (20/10/2026, HTTP 200):
 * listagem (ListarOrdemProducao, 1.114 OPs / 112 páginas) e consulta dirigida
 * (ConsultarOrdemProducao, OP 9858633368 do piloto M011001 completa).
 *
 * CA-O1: NENHUMA chamada mutante sai sem contrato/teste/aceite específico.
 * Os mutantes (Incluir/Alterar/Upsert/Excluir/Concluir/Reverter) ficam DOCUMENTADOS
 * com executado:false; a guarda `mutanteAutorizado` nega qualquer envio sem caso
 * explícito autorizado (a2a4ccf1 NÃO executa mutante — T5 é da 6e38e5a3, com
 * autorização específica do owner).
 */

export interface MutanteOP {
  call: string
  campos_request: string[]
  executado: false
}

/** Mapa do contrato de OP comprovado na conta (CA-O1 — sondas 20/10/2026). */
export const MAPA_OP = {
  piloto: { codigo: 'M011001', produto_id: '9337428906' },
  listar: {
    endpoint: 'https://app.omie.com.br/api/v1/produtos/op/',
    call: 'ListarOrdemProducao',
    campos_request: [
      'pagina',
      'registros_por_pagina',
      'apenas_importado_api',
      'ordenar_por',
      'ordem_decrescente',
      'nCodProjeto',
      'nIdProd',
      'lExibirItens',
      'dDtConclusaoDe',
      'dDtConclusaoAte',
      'cConcluida',
    ],
    chave_resposta: 'cadastros',
    campos_resposta: ['pagina', 'total_de_paginas', 'registros', 'total_de_registros', 'cadastros'],
    provado_em: '2026-10-20',
    conta: { total_de_registros: 1114, total_de_paginas: 112 },
  },
  consultar: {
    endpoint: 'https://app.omie.com.br/api/v1/produtos/op/',
    call: 'ConsultarOrdemProducao',
    campos_request: ['nCodOP', 'cCodIntOP'],
    campos_resposta: [
      'identificacao',
      'infAdicionais',
      'observacoes',
      'outrasInf',
      'itens',
      'itensDetalhes',
    ],
    fault_oficial:
      'SOAP-ENV:Client-101 (Código e Código de Integração da Ordem de Produção não informados)',
    provado_em: '2026-10-20',
  },
  amostra: {
    nCodOP: '9858633368',
    cNumOP: '2026/00003',
    nCodProduto: '9337428906',
    nQtde: 24,
    codigo_local_estoque: '9300980125',
    cConcluida: 'S',
    dDtPrevisao: '20/03/2026',
    dConclusao: '23/03/2026',
    itensDetalhes: 14,
    baunilha_nqtde: 1.2,
    total_de_registros: 1114,
  },
  mutantes: [
    {
      call: 'IncluirOrdemProducao',
      campos_request: ['identificacao', 'infAdicionais', 'observacoes', 'outrasInf', 'itens'],
      executado: false,
    },
    {
      call: 'AlterarOrdemProducao',
      campos_request: ['identificacao', 'infAdicionais', 'observacoes', 'outrasInf', 'itens'],
      executado: false,
    },
    {
      call: 'UpsertOrdemProducao',
      campos_request: ['identificacao', 'infAdicionais', 'observacoes', 'outrasInf', 'itens'],
      executado: false,
    },
    { call: 'ExcluirOrdemProducao', campos_request: ['nCodOP', 'cCodIntOP'], executado: false },
    {
      call: 'ConcluirOrdemProducao',
      campos_request: ['nCodOP', 'cCodIntOP', 'dDtConclusao', 'nQtdeProduzida', 'cObsConclusao'],
      executado: false,
    },
    { call: 'ReverterOrdemProducao', campos_request: ['nCodOP', 'cCodIntOP'], executado: false },
  ] as MutanteOP[],
} as const

export interface PedidoMutante {
  /** true somente com caso real EXPRESSAMENTE autorizado (ex.: 6e38e5a3). */
  casoAutorizado?: boolean
  /** Quem autorizou o caso (owner/PCP) — registro de trilha. */
  autorizadoPor?: string
  /** Hash da revisão conferida aprovada (CA-O2). */
  revisao_hash?: string
}

/**
 * Guarda do CA-O1: mutante só sai com caso autorizado explicitamente
 * (autorização + autor + hash da revisão aprovada). Qualquer coisa menos que
 * isso é NEGADO — nenhuma chamada mutante por suposição.
 */
export function mutanteAutorizado(p: PedidoMutante | null | undefined): boolean {
  return Boolean(
    p &&
    p.casoAutorizado === true &&
    typeof p.autorizadoPor === 'string' &&
    p.autorizadoPor.trim() !== '' &&
    typeof p.revisao_hash === 'string' &&
    p.revisao_hash.trim() !== '',
  )
}
