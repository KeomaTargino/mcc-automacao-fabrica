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

const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR') : '—'

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
      Fonte: {meta.fonte ?? '—'} · {meta.recurso ?? '—'} · lote {meta.lote?.slice(0, 8) || '—'} ·
      último sucesso: {fmtData(meta.ultimo_sucesso)} · estado: {meta.estado_tecnico || '—'}
    </p>
  )
}

function Pendencias({ lista }: { lista?: string[] }) {
  if (!lista || lista.length === 0) return null
  return (
    <ul className="mt-2 list-disc list-inside text-sm text-orange-800">
      {lista.map((p, i) => (
        <li key={i}>{p}</li>
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
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-3 py-2">
          Bloco indisponível —{' '}
          {bloco.motivo === 'fonte_nao_integrada_na_fase_1'
            ? 'fonte não integrada na Fase 1 (não declarado como integrado).'
            : bloco.motivo === 'sem_lote_ativo'
              ? 'sem lote ativo no momento.'
              : bloco.motivo || 'indisponível.'}
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
        setErro(
          String(err?.response?.data?.message || err?.message || 'Falha ao carregar o painel.'),
        )
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
      {resposta?.gerado_em && (
        <p className="text-xs text-muted-foreground mb-4">
          Gerado em {new Date(resposta.gerado_em).toLocaleString('pt-BR')} · filtros:{' '}
          {JSON.stringify(resposta.filtros)}
        </p>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Filtros (mesma janela/lote para linhas e totais)
          </CardTitle>
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
        <div
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}

      {carregando && (
        <p className="text-sm text-muted-foreground" role="status">
          Carregando…
        </p>
      )}

      {!carregando && resposta && !resposta.disponivel && (
        <div
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Painel indisponível — {resposta.motivo || 'sem dados autorizados'}
        </div>
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2">Código</th>
                      <th className="pb-2">Descrição</th>
                      <th className="pb-2">Local</th>
                      <th className="pb-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(estoque.itens || []).map((l) => (
                      <tr key={`${l.produto_id}-${l.local_id}-${l.unidade}`}>
                        <td className="py-1 font-mono text-xs">{l.codigo}</td>
                        <td>{l.descricao}</td>
                        <td className="font-mono text-xs">{l.local_id}</td>
                        <td className="text-right">
                          {l.saldo === null || l.saldo === undefined ? (
                            <span className="text-orange-700">saldo ausente (null ≠ zero)</span>
                          ) : (
                            `${l.saldo} ${l.unidade}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pendencias lista={estoque.pendencias} />
                {estoque.nota && (
                  <p className="text-xs text-muted-foreground mt-2">{estoque.nota}</p>
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
                        ? `${pedidos.oficiais.total_por_id_unico} pedido(s) por ID único`
                        : `indisponível — ${pedidos.oficiais.motivo}`}
                    </p>
                    <MetaFonte meta={pedidos.oficiais} />
                    {pedidos.oficiais.disponivel && pedidos.oficiais.por_etapa && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Por etapa (original):{' '}
                        {Object.entries(pedidos.oficiais.por_etapa)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                    {pedidos.oficiais.nota && (
                      <p className="text-xs text-muted-foreground">{pedidos.oficiais.nota}</p>
                    )}
                  </div>
                )}
                {pedidos.complementares && (
                  <div>
                    <p className="text-sm font-medium">
                      Complementares (Nuvemshop):{' '}
                      {pedidos.complementares.disponivel
                        ? 'classificados na precedência da SPEC'
                        : `indisponível — ${pedidos.complementares.motivo}`}
                    </p>
                    <MetaFonte meta={pedidos.complementares} />
                    {pedidos.complementares.disponivel && pedidos.complementares.contagem && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(pedidos.complementares.contagem).map(([k, v]) => (
                          <Badge key={k} variant="outline">
                            {k}: {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {pedidos.complementares.aviso && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {pedidos.complementares.aviso}
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
