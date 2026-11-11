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
import Aviso from '@/components/Aviso'
import { mensagemDeErro, semInformacao, textoSeguro } from '@/lib/pcp/textos'
import { dataEHora } from '@/lib/pcp/formato'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
              <Aviso nivel="atencao" topo>
                <p className="font-medium">O que está faltando (nada é preenchido sozinho):</p>
                <ul className="mt-1 list-disc list-inside">
                  {pilotoConciliado.bloqueios.map((b) => (
                    <li key={b}>{textoSeguro(b, 'Falta um dado oficial.')}</li>
                  ))}
                </ul>
              </Aviso>
            )}
            {pilotoConciliado.ficha && pilotoConciliado.ficha.itens.length > 0 && (
              <div className="mt-3">
                <p className="font-medium mb-1 text-sm">
                  Ficha técnica (como está no Omie, sem conversão):
                </p>
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-left text-muted-foreground">
                      <TableHead className="pb-1">Insumo</TableHead>
                      <TableHead className="pb-1">Descrição</TableHead>
                      <TableHead className="pb-1">Quantidade</TableHead>
                      <TableHead className="pb-1">Unidade</TableHead>
                      <TableHead className="pb-1">Perda %</TableHead>
                      <TableHead className="pb-1">Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pilotoConciliado.ficha.itens.map((i) => (
                      <TableRow key={i.insumo}>
                        <TableCell className="py-1 font-mono text-xs">{i.insumo}</TableCell>
                        <TableCell>{i.descricao}</TableCell>
                        <TableCell>{i.quantidade}</TableCell>
                        <TableCell>{i.unidade}</TableCell>
                        <TableCell>{i.perda_pct}</TableCell>
                        <TableCell className="font-mono text-xs">{i.tipo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
              <p className="mt-2 text-sm text-warning">
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
        <Aviso nivel="atencao">
          Produto de conferência indisponível — nada foi inventado. Motivo:{' '}
          {textoSeguro(piloto.motivo, 'não foi possível consultar agora.')}
          {piloto.detalhe ? ` (${textoSeguro(piloto.detalhe, '')})` : ''}
        </Aviso>
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

      {erro && <Aviso nivel="bloqueio">{erro}</Aviso>}

      {dados && !dados.disponivel && (
        <Aviso nivel="atencao">
          <p className="font-semibold">
            Catálogo indisponível com dado oficial — nada foi inventado.
          </p>
          <p className="mt-1">
            {dados.motivo === 'cadastro_omnie_vazio'
              ? 'O cadastro de produtos do Omie está vazio nesta conta. Quando for preenchido, a lista aparece aqui.'
              : 'Ainda não há produtos carregados.'}
          </p>
          {(dados.pendencias || []).map((p, i) => (
            <p key={i} className="mt-1 text-warning">
              {textoSeguro(p, 'Há uma pendência neste cadastro.')}
            </p>
          ))}
        </Aviso>
      )}

      {dados && dados.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Produtos do Omie — {dados.total} registro(s) · atualizado{' '}
              {dados.atualizado_em ? dataEHora(dados.atualizado_em) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dados.produtos && dados.produtos.length > 0 ? (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow className="text-left text-muted-foreground">
                    <TableHead className="pb-2">ID (Omie)</TableHead>
                    <TableHead className="pb-2">Código</TableHead>
                    <TableHead className="pb-2">Descrição</TableHead>
                    <TableHead className="pb-2">Unidade</TableHead>
                    <TableHead className="pb-2">Ativo</TableHead>
                    <TableHead className="pb-2">Família</TableHead>
                    <TableHead className="pb-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.produtos.map((p) => (
                    <TableRow key={p.produto_id}>
                      <TableCell className="py-1 font-mono text-xs">{p.produto_id}</TableCell>
                      <TableCell className="py-1">{p.codigo}</TableCell>
                      <TableCell>{p.descricao}</TableCell>
                      <TableCell>
                        {p.unidade || <span className="text-warning">{semInformacao()}</span>}
                      </TableCell>
                      <TableCell>{p.ativo === 'S' ? 'Sim' : 'Não'}</TableCell>
                      <TableCell>{p.familia}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirDetalhe(p.produto_id)}
                        >
                          Detalhe
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                <Aviso nivel="atencao">
                  Ficha técnica: <strong>ainda não disponível</strong> — o Omie não entrega a ficha
                  por esta conexão. Nada é inventado.
                </Aviso>
                {detalhe.pendencias && detalhe.pendencias.length > 0 && (
                  <Aviso nivel="atencao">
                    <p className="font-medium">
                      Pendências deste item (nada é preenchido sozinho):
                    </p>
                    <ul className="mt-1 list-disc list-inside">
                      {detalhe.pendencias.map((p, i) => (
                        <li key={i}>{textoSeguro(p, 'Há uma pendência neste item.')}</li>
                      ))}
                    </ul>
                  </Aviso>
                )}
                {detalhe.saldo &&
                  (detalhe.saldo.disponivel ? (
                    <div>
                      <p className="font-medium mb-1">Saldo por local:</p>
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="text-left text-muted-foreground">
                            <TableHead className="pb-1">Local</TableHead>
                            <TableHead className="pb-1">Unidade</TableHead>
                            <TableHead className="pb-1">Saldo</TableHead>
                            <TableHead className="pb-1">Físico</TableHead>
                            <TableHead className="pb-1">Reservado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(detalhe.saldo.por_local || []).map((l) => (
                            <TableRow key={l.local_id}>
                              <TableCell className="py-1 font-mono text-xs">{l.local_id}</TableCell>
                              <TableCell>
                                {l.unidade}
                                {l.unidade_incompativel && (
                                  <span className="ml-1 text-warning">
                                    (incompatível com o cadastro — sem conversão)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{l.saldo}</TableCell>
                              <TableCell>{l.fisico}</TableCell>
                              <TableCell>{l.reservado}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
