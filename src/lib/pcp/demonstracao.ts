/**
 * Teste e demonstração separados do real — SPEC-4-001, CA-4-34.
 *
 * Todo registro gravado por conta marcada como de teste (`teste` no perfil), ou ligado a produto de
 * demonstração, sai com `demonstracao = true`. A marca nunca sai sozinha. Registro marcado fica fora de
 * relatório, alerta e exportação de dados reais, e as rotas de autorização e de envio ao Omie o recusam
 * (422 `registro_de_demonstracao`), com a chave ligada ou desligada. Nada aqui chama o Omie.
 */

/** Códigos de demonstração usados nas fixtures: qualquer "DEMO", COOKIE-1 e os insumos INS-n. */
export const PADRAO_PRODUTO_DEMO = /DEMO|^COOKIE-1$|^INS-\d+$/i

export function produtoEhDemonstracao(codigo: string | null | undefined): boolean {
  const c = String(codigo ?? '').trim()
  return c !== '' && PADRAO_PRODUTO_DEMO.test(c)
}

export function registroEhDemonstracao(e: {
  contaDeTeste: boolean
  produtos: (string | null | undefined)[]
  jaMarcado?: boolean
}): boolean {
  return e.jaMarcado === true || e.contaDeTeste === true || e.produtos.some(produtoEhDemonstracao)
}

/** Recusa de autorização/envio: vale com a chave ligada ou desligada. */
export function recusarDemonstracao(
  registro: { demonstracao?: boolean | null },
  _chave?: { ligada: boolean },
): { http: 422; erro: 'registro_de_demonstracao' } | null {
  return registro.demonstracao === true ? { http: 422, erro: 'registro_de_demonstracao' } : null
}
