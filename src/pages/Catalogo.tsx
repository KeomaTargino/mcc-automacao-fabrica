import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  obterCatalogo,
  obterDetalhe,
  type RespostaCatalogo,
  type DetalheCatalogo,
} from '@/services/pcp-catalogo'
import { obterPiloto, type RespostaPiloto } from '@/services/pcp-piloto'
import { conciliarProduto } from '@/lib/pcp/conciliacao'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, semInformacao, textoSeguro } from '@/lib/pcp/textos'

const Catalogo = () => {
  const [piloto, setPiloto] = useState<RespostaPiloto | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<RespostaCatalogo | null>(null)
  const [detalhe, setDetalhe] = useState<DetalheCatalogo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = (b: string, p: number) => {
    setCarregando(true)
    setErro('')
    obterCatalogo(b, p)
      .then((r) => {
        setDados(r)
        setCarregando(false)
      })
      .catch((err: any) => {
        setErro(mensagemDeErro(err))
        setCarregando(false)
      })
  }

  useEffect(() => {
    carregar(buscaAplicada, pagina)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAplicada, pagina])

  // 5d8793fb: piloto real M011001 — conciliação aplicada no frontend (contrato conciliacao.ts).
  const [pilotoConciliado, setPilotoConciliado] = useState<ReturnType<
    typeof conciliarProduto
  > | null>(null)
  useEffect(() => {
    obterPiloto()
      .then((r) => {
        setPiloto(r)
        if (r.disponivel && r.produto) {
          setPilotoConciliado(
            conciliarProduto({
              produto_id: r.produto.produto_id,
              codigo: r.produto.codigo,
              descricao: r.produto.descricao,
              unidade: r.produto.unidade || null,
              ficha: r.ficha ?? null,
              locais: r.locais || [],
              unidades_estoque: r.unidades_estoque || [],
            }),
          )
        } else {
          setPilotoConciliado(null)
        }
      })
      .catch(() => {
        setPiloto({ disponivel: false, motivo: 'falha_consulta' })
        setPilotoConciliado(null)
      })
  }, [])

  const abrirDetalhe = (produtoId: string) => {
    setDetalhe(null)
    obterDetalhe(produtoId)
      .then(setDetalhe)
      .catch(() => setDetalhe({ disponivel: false, motivo: 'falha_consulta' }))
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Catálogo</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Produtos lidos do Omie, com unidade, família e saldo por local.
      </p>
      <ComoFunciona>
        <p>
          Nada é preenchido sozinho: o que o Omie não informa aparece como “sem informação”. A ficha
          técnica só aparece quando o Omie a entrega por esta conexão.
        </p>
      </ComoFunciona>

      {piloto && piloto.disponivel && pilotoConciliado && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              Produto de conferência — {pilotoConciliado.descricao} ({pilotoConciliado.codigo})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Unidade oficial:</span>{' '}
                <strong>{pilotoConciliado.unidade_oficial}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Família:</span>{' '}
                {piloto.produto?.familia || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Ativo:</span>{' '}
                {piloto.produto?.ativo === 'S' ? 'Sim' : 'Não'}
              </div>
              <div>
                <span className="text-muted-foreground">Itens da ficha:</span>{' '}
                {pilotoConciliado.ficha?.itens.length ?? 0}
              </div>
            </div>
            {pilotoConciliado.bloqueios.length > 0 && (
              <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-orange-900">
                <p className="font-medium">O que está faltando (nada é preenchido sozinho):</p>
                <ul className="mt-1 list-disc list-inside">
                  {pilotoConciliado.bloqueios.map((b) => (
                    <li key={b}>{textoSeguro(b, 'Falta um dado oficial.')}</li>
                  ))}
                </ul>
              </div>
            )}
            {pilotoConciliado.ficha && pilotoConciliado.ficha.itens.length > 0 && (
              <div className="mt-3">
                <p className="font-medium mb-1 text-sm">
                  Ficha técnica (como está no Omie, sem conversão):
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-1">Insumo</th>
                      <th className="pb-1">Descrição</th>
                      <th className="pb-1">Quantidade</th>
                      <th className="pb-1">Unidade</th>
                      <th className="pb-1">Perda %</th>
                      <th className="pb-1">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pilotoConciliado.ficha.itens.map((i) => (
                      <tr key={i.insumo}>
                        <td className="py-1 font-mono text-xs">{i.insumo}</td>
                        <td>{i.descricao}</td>
                        <td>{i.quantidade}</td>
                        <td>{i.unidade}</td>
                        <td>{i.perda_pct}</td>
                        <td className="font-mono text-xs">{i.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {piloto.locais && piloto.locais.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Locais de estoque na conta:{' '}
                {piloto.locais
                  .map((l) => `${l.descricao} (${l.local_id})${l.padrao ? ' — padrão' : ''}`)
                  .join('; ')}
              </p>
            )}
            {piloto.unidades_estoque && piloto.unidades_estoque.length > 0 && (
              <p className="mt-2 text-sm text-amber-800">
                Unidades registradas nas linhas de estoque do lote ativo:{' '}
                {piloto.unidades_estoque.join(', ')}
                {pilotoConciliado.unidades_estoque_incompativeis.length > 0 &&
                  ` — incompatíveis com o cadastro (sem conversão): ${pilotoConciliado.unidades_estoque_incompativeis.join(', ')}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {piloto && !piloto.disponivel && (
        <div
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Produto de conferência indisponível — nada foi inventado. Motivo:{' '}
          {textoSeguro(piloto.motivo, 'não foi possível consultar agora.')}
          {piloto.detalhe ? ` (${textoSeguro(piloto.detalhe, '')})` : ''}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Buscar produtos (fonte: Omie)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Código ou descrição…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPagina(1)
                  setBuscaAplicada(busca)
                }
              }}
            />
            <Button
              onClick={() => {
                setPagina(1)
                setBuscaAplicada(busca)
              }}
            >
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && (
        <div
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}

      {dados && !dados.disponivel && (
        <div
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <p className="font-semibold">
            Catálogo indisponível com dado oficial — nada foi inventado.
          </p>
          <p className="mt-1">
            {dados.motivo === 'cadastro_omnie_vazio'
              ? 'O cadastro de produtos do Omie está vazio nesta conta. Quando for preenchido, a lista aparece aqui.'
              : 'Ainda não há produtos carregados.'}
          </p>
          {(dados.pendencias || []).map((p, i) => (
            <p key={i} className="mt-1 text-amber-800">
              {textoSeguro(p, 'Há uma pendência neste cadastro.')}
            </p>
          ))}
        </div>
      )}

      {dados && dados.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Produtos do Omie — {dados.total} registro(s) · atualizado{' '}
              {dados.atualizado_em ? new Date(dados.atualizado_em).toLocaleString('pt-BR') : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dados.produtos && dados.produtos.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2">ID (Omie)</th>
                    <th className="pb-2">Código</th>
                    <th className="pb-2">Descrição</th>
                    <th className="pb-2">Unidade</th>
                    <th className="pb-2">Ativo</th>
                    <th className="pb-2">Família</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {dados.produtos.map((p) => (
                    <tr key={p.produto_id}>
                      <td className="py-1 font-mono text-xs">{p.produto_id}</td>
                      <td className="py-1">{p.codigo}</td>
                      <td>{p.descricao}</td>
                      <td>
                        {p.unidade || <span className="text-amber-700">{semInformacao()}</span>}
                      </td>
                      <td>{p.ativo === 'S' ? 'Sim' : 'Não'}</td>
                      <td>{p.familia}</td>
                      <td>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirDetalhe(p.produto_id)}
                        >
                          Detalhe
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">
                {buscaAplicada
                  ? 'Nenhum produto encontrado para a busca.'
                  : 'Ainda não há produtos carregados (cadastro vazio no Omie).'}
              </p>
            )}
            {dados.paginas > 1 && (
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina(pagina - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {dados.pagina} de {dados.paginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= dados.paginas}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {detalhe && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              {detalhe.disponivel && detalhe.produto
                ? `Detalhe — ${detalhe.produto.descricao} (${detalhe.produto.codigo})`
                : 'Detalhe indisponível'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detalhe.disponivel && detalhe.produto ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">ID (Omie):</span>{' '}
                    <span className="font-mono text-xs">{detalhe.produto.produto_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Código:</span> {detalhe.produto.codigo}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unidade:</span>{' '}
                    {detalhe.produto.unidade || semInformacao()}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ativo:</span>{' '}
                    {detalhe.produto.ativo === 'S' ? 'Sim' : 'Não'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Família:</span>{' '}
                    {detalhe.produto.familia || '—'}
                  </div>
                </div>
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  Ficha técnica: <strong>ainda não disponível</strong> — o Omie não entrega a ficha
                  por esta conexão. Nada é inventado.
                </div>
                {detalhe.pendencias && detalhe.pendencias.length > 0 && (
                  <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-orange-900">
                    <p className="font-medium">
                      Pendências deste item (nada é preenchido sozinho):
                    </p>
                    <ul className="mt-1 list-disc list-inside">
                      {detalhe.pendencias.map((p, i) => (
                        <li key={i}>{textoSeguro(p, 'Há uma pendência neste item.')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detalhe.saldo &&
                  (detalhe.saldo.disponivel ? (
                    <div>
                      <p className="font-medium mb-1">Saldo por local:</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pb-1">Local</th>
                            <th className="pb-1">Unidade</th>
                            <th className="pb-1">Saldo</th>
                            <th className="pb-1">Físico</th>
                            <th className="pb-1">Reservado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detalhe.saldo.por_local || []).map((l) => (
                            <tr key={l.local_id}>
                              <td className="py-1 font-mono text-xs">{l.local_id}</td>
                              <td>
                                {l.unidade}
                                {l.unidade_incompativel && (
                                  <span className="ml-1 text-orange-700">
                                    (incompatível com o cadastro — sem conversão)
                                  </span>
                                )}
                              </td>
                              <td>{l.saldo}</td>
                              <td>{l.fisico}</td>
                              <td>{l.reservado}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-md border px-3 py-2 text-sm bg-muted">
                      Saldo: não exibido —{' '}
                      {detalhe.saldo.motivo === 'area_estoque_nao_autorizada'
                        ? 'seu perfil não tem acesso ao estoque.'
                        : detalhe.saldo.motivo === 'estoque_sem_lote_ativo'
                          ? 'ainda não há leitura de estoque.'
                          : 'sem saldo registrado para este produto.'}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {detalhe.motivo === 'produto_nao_encontrado'
                  ? 'Produto não encontrado na leitura atual. O histórico foi preservado.'
                  : 'Ainda não há produtos carregados (cadastro vazio no Omie).'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Catalogo
