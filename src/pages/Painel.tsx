import { useEffect, useState } from 'react'
import {
  obterPainel,
  type RespostaPainel,
  type BlocoEstoque,
  type BlocoPedidos,
} from '@/services/pcp-painel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, semInformacao, textoSeguro } from '@/lib/pcp/textos'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import Aviso from '@/components/Aviso'
import { dataEHora } from '@/lib/pcp/formato'

const fmtData = (iso: string | null | undefined) => (iso ? dataEHora(iso) : '—')

function MetaFonte({
  meta,
}: {
  meta: {
    fonte?: string
    recurso?: string
    lote?: string
    ultimo_sucesso?: string | null
    estado_tecnico?: string
  }
}) {
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Fonte: {meta.fonte ?? '—'} · {meta.recurso ?? '—'} · última leitura:{' '}
      {fmtData(meta.ultimo_sucesso)}
    </p>
  )
}

function Pendencias({ lista }: { lista?: string[] }) {
  if (!lista || lista.length === 0) return null
  return (
    <ul className="mt-2 list-disc list-inside text-sm text-warning">
      {lista.map((p, i) => (
        <li key={i}>{textoSeguro(p, 'Há uma pendência neste bloco.')}</li>
      ))}
    </ul>
  )
}

function BlocoIndisponivel({
  titulo,
  bloco,
}: {
  titulo: string
  bloco: { autorizado: boolean; disponivel?: boolean; motivo?: string; pendencias?: string[] }
}) {
  if (!bloco.autorizado) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{titulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sem permissão para esta área.</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
          Bloco indisponível —{' '}
          {bloco.motivo === 'fonte_nao_integrada_na_fase_1'
            ? 'esta fonte ainda não está ligada ao sistema.'
            : bloco.motivo === 'sem_lote_ativo'
              ? 'ainda não há leitura carregada.'
              : textoSeguro(bloco.motivo, 'indisponível.')}
        </p>
        <Pendencias lista={bloco.pendencias} />
      </CardContent>
    </Card>
  )
}

const Painel = () => {
  const [resposta, setResposta] = useState<RespostaPainel | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [item, setItem] = useState('')
  const [status, setStatus] = useState('')
  const [local, setLocal] = useState('')
  const [filtrosAplicados, setFiltrosAplicados] = useState<{
    item?: string
    status?: string
    local?: string
  }>({})

  const carregar = (f: { item?: string; status?: string; local?: string }) => {
    setCarregando(true)
    setErro('')
    obterPainel(f)
      .then((r) => {
        setResposta(r)
        setCarregando(false)
      })
      .catch((err: any) => {
        setErro(mensagemDeErro(err))
        setCarregando(false)
      })
  }

  useEffect(() => {
    carregar(filtrosAplicados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosAplicados])

  const blocos = resposta?.blocos
  const estoque: BlocoEstoque | undefined = blocos?.estoque
  const pedidos: BlocoPedidos | undefined = blocos?.pedidos

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Painel diário</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Estoque, produção, compras e pedidos do dia, com as mesmas regras de filtro.
      </p>
      <ComoFunciona>
        <p>
          Linhas e totais usam sempre a mesma leitura do Omie. O saldo nunca soma unidades
          diferentes. Onde não há informação, a tela diz que não há, em vez de mostrar zero.
        </p>
      </ComoFunciona>
      {resposta?.gerado_em && (
        <p className="text-xs text-muted-foreground mb-4">
          Gerado em {dataEHora(resposta.gerado_em)}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-[220px]"
              placeholder="Item (código/descrição/№)"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <Input
              className="max-w-[160px]"
              placeholder="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
            <Input
              className="max-w-[140px]"
              placeholder="Local (estoque)"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
            <Button
              onClick={() =>
                setFiltrosAplicados({
                  item: item.trim(),
                  status: status.trim(),
                  local: local.trim(),
                })
              }
            >
              Aplicar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setItem('')
                setStatus('')
                setLocal('')
                setFiltrosAplicados({})
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && (
        <Aviso nivel="bloqueio" topo>
          {erro}
        </Aviso>
      )}

      {carregando && <Skeleton className="h-24 w-full" aria-label="Carregando" />}

      {!carregando && resposta && !resposta.disponivel && (
        <Aviso nivel="atencao">
          Painel indisponível — {textoSeguro(resposta.motivo, 'sem dados autorizados')}
        </Aviso>
      )}

      {!carregando && resposta?.disponivel && blocos && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* ESTOQUE */}
          {estoque && !estoque.autorizado && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estoque</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sem permissão para esta área.</p>
              </CardContent>
            </Card>
          )}
          {estoque && estoque.autorizado && !estoque.disponivel && (
            <BlocoIndisponivel titulo="Estoque" bloco={estoque} />
          )}
          {estoque && estoque.autorizado && estoque.disponivel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estoque — {estoque.total} linha(s)</CardTitle>
                <MetaFonte meta={estoque} />
              </CardHeader>
              <CardContent>
                {estoque.resumo_por_unidade &&
                  Object.keys(estoque.resumo_por_unidade).length > 0 && (
                    <p className="text-sm mb-2">
                      Resumo por unidade (nunca soma unidades distintas):{' '}
                      {Object.entries(estoque.resumo_por_unidade)
                        .map(([u, n]) => `${n} ${u}`)
                        .join(' · ')}
                    </p>
                  )}
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-left text-muted-foreground">
                      <TableHead className="pb-2">Código</TableHead>
                      <TableHead className="pb-2">Descrição</TableHead>
                      <TableHead className="pb-2">Local</TableHead>
                      <TableHead className="pb-2 text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(estoque.itens || []).map((l) => (
                      <TableRow key={`${l.produto_id}-${l.local_id}-${l.unidade}`}>
                        <TableCell className="py-1 font-mono text-xs">{l.codigo}</TableCell>
                        <TableCell>{l.descricao}</TableCell>
                        <TableCell className="font-mono text-xs">{l.local_id}</TableCell>
                        <TableCell className="text-right">
                          {l.saldo === null || l.saldo === undefined ? (
                            <span className="text-warning">{semInformacao('saldo')}</span>
                          ) : (
                            `${l.saldo} ${l.unidade}`
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pendencias lista={estoque.pendencias} />
                {estoque.nota && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {textoSeguro(estoque.nota, '')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* PRODUÇÃO */}
          <BlocoIndisponivel titulo="Produção" bloco={blocos.producao} />

          {/* COMPRAS */}
          <BlocoIndisponivel titulo="Compras" bloco={blocos.compras} />

          {/* PEDIDOS */}
          {pedidos && !pedidos.autorizado && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedidos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Sem permissão para esta área.</p>
              </CardContent>
            </Card>
          )}
          {pedidos && pedidos.autorizado && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pedidos — oficiais (Omie) e complementares (canal)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pedidos.oficiais && (
                  <div className="mb-3">
                    <p className="text-sm font-medium">
                      Oficiais (Omie):{' '}
                      {pedidos.oficiais.disponivel
                        ? `${pedidos.oficiais.total_por_id_unico} pedido(s), sem repetição`
                        : `indisponível — ${textoSeguro(pedidos.oficiais.motivo, 'sem informação')}`}
                    </p>
                    <MetaFonte meta={pedidos.oficiais} />
                    {pedidos.oficiais.disponivel && pedidos.oficiais.por_etapa && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Por etapa (original):{' '}
                        {Object.entries(pedidos.oficiais.por_etapa)
                          .map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                    {pedidos.oficiais.nota && (
                      <p className="text-xs text-muted-foreground">
                        {textoSeguro(pedidos.oficiais.nota, '')}
                      </p>
                    )}
                  </div>
                )}
                {pedidos.complementares && (
                  <div>
                    <p className="text-sm font-medium">
                      Complementares (Nuvemshop):{' '}
                      {pedidos.complementares.disponivel
                        ? 'classificados pela ordem de prioridade combinada'
                        : `indisponível — ${textoSeguro(pedidos.complementares.motivo, 'sem informação')}`}
                    </p>
                    <MetaFonte meta={pedidos.complementares} />
                    {pedidos.complementares.disponivel && pedidos.complementares.contagem && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(pedidos.complementares.contagem).map(([k, v]) => (
                          <Badge key={k} variant="outline">
                            {String(k).replace(/_/g, ' ')}: {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {pedidos.complementares.aviso && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {textoSeguro(pedidos.complementares.aviso, '')}
                      </p>
                    )}
                  </div>
                )}
                <Pendencias lista={pedidos.pendencias} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default Painel
