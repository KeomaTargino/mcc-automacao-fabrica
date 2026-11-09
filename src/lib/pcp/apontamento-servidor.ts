/**
 * Apontamentos pelo servidor — SPEC-4-001 (CA-4-02). Contrato puro da tela /apontamentos:
 * formulário, mensagens (provisórias até a SPEC-4-004) e resumo da ordem a partir dos eventos
 * guardados. Não muda nenhuma regra de apontamento: as regras ficam na rota e em apontamento.ts.
 */

export type TipoApontamento = 'retirada' | 'adicional' | 'devolucao' | 'perda' | 'realizado'

export interface FormularioApontamento {
  tipo: TipoApontamento
  item: string
  quantidade: number
  unidade: string
  motivo: string
}

export interface EventoLido {
  evento_id: string
  op_id: string
  ponto: string
  tipo: string
  item: string
  quantidade: number
  unidade: string
  motivo: string | null
  retifica: string | null
  autor: string
}

/** Identificador do evento, gerado na tela. Reenviar o mesmo evento usa o mesmo identificador. */
export function novoEventoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return 'EV-' + c.randomUUID()
  return 'EV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/** Assinatura do formulário: a mesma tentativa reaproveita o identificador até dar certo. */
export function assinaturaDoFormulario(
  opId: string,
  ponto: string,
  f: FormularioApontamento,
): string {
  return JSON.stringify([
    opId,
    ponto,
    f.tipo,
    f.item.trim(),
    f.quantidade,
    f.unidade.trim(),
    f.motivo.trim(),
  ])
}

/** Confere o formulário antes de enviar (a rota confere de novo; esta é só a primeira linha). */
export function validarFormulario(
  f: FormularioApontamento,
): { ok: true } | { ok: false; motivo: string } {
  if (!f.item.trim()) return { ok: false, motivo: 'Informe o item.' }
  if (!f.unidade.trim()) return { ok: false, motivo: 'Informe a unidade.' }
  if (!Number.isFinite(f.quantidade)) return { ok: false, motivo: 'Informe a quantidade.' }
  if (f.tipo !== 'realizado' && f.quantidade <= 0)
    return { ok: false, motivo: 'A quantidade precisa ser maior que zero.' }
  if (f.tipo === 'realizado' && f.quantidade < 0)
    return { ok: false, motivo: 'A quantidade não pode ser negativa.' }
  if (f.tipo === 'realizado' && f.quantidade === 0 && !f.motivo.trim())
    return { ok: false, motivo: 'Realizado 0 exige motivo.' }
  return { ok: true }
}

export interface MensagemApontamento {
  ok: boolean
  texto: string
  /** A tela relê o servidor depois desta resposta. */
  recarregar: boolean
  /** O mesmo identificador pode ser reenviado (falha de rede ou resposta de servidor). */
  manterId: boolean
}

/** Mensagens provisórias; falta de acesso nunca dá pista do que faltou. */
export function mensagemDoApontamento(http: number, corpo: any): MensagemApontamento {
  if (http === 200 && corpo?.estado === 'replay')
    return {
      ok: true,
      texto: 'Esse apontamento já estava registrado. Nada foi duplicado.',
      recarregar: true,
      manterId: false,
    }
  if (http === 200)
    return {
      ok: true,
      texto: corpo?.aprovacao_invalidada
        ? 'Apontamento registrado. A aprovação do PCP dessa ordem foi invalidada e precisa ser refeita.'
        : 'Apontamento registrado.',
      recarregar: true,
      manterId: false,
    }
  if (http === 401 || http === 403)
    return {
      ok: false,
      texto: 'Você não tem acesso a essa ação.',
      recarregar: false,
      manterId: false,
    }
  if (http === 409 && corpo?.erro === 'ordem_em_envio')
    return {
      ok: false,
      texto: 'Essa ordem já está em envio ao Omie e não recebe mais apontamento.',
      recarregar: true,
      manterId: false,
    }
  if (http === 409)
    return {
      ok: false,
      texto:
        'Esse identificador já foi usado com outro conteúdo. Recarregue a tela e registre de novo.',
      recarregar: true,
      manterId: false,
    }
  if (http === 422) {
    const m: Record<string, string> = {
      ordem_inexistente: 'Essa ordem não está na programação publicada.',
      tipo_invalido: 'Tipo de apontamento inválido.',
      item_obrigatorio: 'Informe o item.',
      quantidade_invalida:
        'A quantidade precisa ser maior que zero (realizado aceita zero com motivo).',
      motivo_obrigatorio: 'Informe o motivo.',
      unidade_desconhecida: 'Informe a unidade.',
      original_inexistente: 'O evento a retificar não existe nessa ordem.',
      evento_e_ordem_obrigatorios: 'Escolha a ordem.',
    }
    return {
      ok: false,
      texto: m[String(corpo?.erro ?? '')] ?? 'O apontamento não foi aceito.',
      recarregar: false,
      manterId: false,
    }
  }
  return {
    ok: false,
    texto: 'Não foi possível registrar agora. Tente de novo: o mesmo apontamento não duplica.',
    recarregar: false,
    manterId: true,
  }
}

/** Eventos que valem: o original deixa de valer quando existe retificação dele. */
export function eventosEficazes(eventos: EventoLido[]): EventoLido[] {
  const retificados = new Set(eventos.filter((e) => e.retifica).map((e) => e.retifica as string))
  return eventos.filter((e) => !retificados.has(e.evento_id))
}

export interface ItemResumo {
  item: string
  unidade: string
  retiradas: number
  adicionais: number
  devolucoes: number
  liquido: number
  perda_declarada: number
}

export interface ResumoOrdem {
  itens: ItemResumo[]
  realizado: Record<string, number>
}

/**
 * Resumo da ordem a partir do servidor: líquido = retiradas + adicionais − devoluções por item e
 * unidade (unidades diferentes nunca se somam); perda fica separada; realizado soma os incrementos
 * por ponto. Sem ficha técnica real, não calcula "previsto" nem diferença.
 */
export function resumoDaOrdem(eventos: EventoLido[], opId: string): ResumoOrdem {
  const validos = eventosEficazes(eventos.filter((e) => e.op_id === opId))
  const porItem = new Map<string, ItemResumo>()
  const realizado: Record<string, number> = {}
  for (const e of validos) {
    if (e.tipo === 'realizado') {
      realizado[e.ponto] = (realizado[e.ponto] ?? 0) + e.quantidade
      continue
    }
    const chave = e.item + '|' + e.unidade
    const r = porItem.get(chave) ?? {
      item: e.item,
      unidade: e.unidade,
      retiradas: 0,
      adicionais: 0,
      devolucoes: 0,
      liquido: 0,
      perda_declarada: 0,
    }
    if (e.tipo === 'retirada') r.retiradas += e.quantidade
    else if (e.tipo === 'adicional') r.adicionais += e.quantidade
    else if (e.tipo === 'devolucao') r.devolucoes += e.quantidade
    else if (e.tipo === 'perda') r.perda_declarada += e.quantidade
    r.liquido = r.retiradas + r.adicionais - r.devolucoes
    porItem.set(chave, r)
  }
  return { itens: Array.from(porItem.values()), realizado }
}
