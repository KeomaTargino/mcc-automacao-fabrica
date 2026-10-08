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

const Catalogo = () => {
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
      .catch(() => {
        setErro('Falha ao consultar o catálogo (sessão expirada ou sem autorização).')
        setCarregando(false)
      })
  }

  useEffect(() => {
    carregar(buscaAplicada, pagina)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAplicada, pagina])

  const abrirDetalhe = (produtoId: string) => {
    setDetalhe(null)
    obterDetalhe(produtoId)
      .then(setDetalhe)
      .catch(() => setDetalhe({ disponivel: false, motivo: 'falha_consulta' }))
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Catálogo</h1>

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
              ? 'O cadastro de produtos do Omie está VAZIO nesta conta (0 registros). O painel fica pronto e passa a listar automaticamente quando o cadastro for povoado no ERP.'
              : 'Sem lote ativo de produtos no momento.'}
          </p>
          {(dados.pendencias || []).map((p, i) => (
            <p key={i} className="mt-1 text-amber-800">
              {p}
            </p>
          ))}
        </div>
      )}

      {dados && dados.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Produtos do Omie — {dados.total} registro(s) · lote {dados.lote_ativo?.slice(0, 8)} ·
              atualizado{' '}
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
                        {p.unidade || <span className="text-amber-700">unidade ausente</span>}
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
                  : 'Lote ativo sem produtos (cadastro vazio na origem).'}
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
                    {detalhe.produto.unidade || 'ausente'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ativo:</span>{' '}
                    {detalhe.produto.ativo === 'S' ? 'Sim' : 'Não'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Família:</span>{' '}
                    {detalhe.produto.familia || '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lote de origem:</span>{' '}
                    <span className="font-mono text-xs">
                      {detalhe.produto.origem_lote?.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  Ficha técnica: <strong>indisponível nesta fase</strong> — o contrato de
                  ficha/receita não está exposto pela API autorizada do Omie; nada é inventado (sem
                  componentes, sem rendimento, sem conversão).
                </div>
                {detalhe.saldo &&
                  (detalhe.saldo.disponivel ? (
                    <div>
                      <p className="font-medium mb-1">Saldo por local (área estoque autorizada):</p>
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
                              <td>{l.unidade}</td>
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
                        ? 'sua área não tem acesso ao estoque (catálogo não concede estoque).'
                        : detalhe.saldo.motivo === 'estoque_sem_lote_ativo'
                          ? 'sem lote de estoque ativo.'
                          : 'sem saldo registrado para este produto.'}
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {detalhe.motivo === 'produto_nao_encontrado'
                  ? 'Produto não encontrado no lote ativo (pode ter saído da janela — referência preservada, sem apagar histórico).'
                  : 'Sem lote ativo de produtos (cadastro vazio na origem).'}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Catalogo
