import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado } from '@/lib/pcp/textos'
import {
  classificarLinhaPreco,
  obterHistorico,
  type RespostaHistorico,
} from '@/services/pcp-compras'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

const moeda = (n: number | null) =>
  n === null ? 'pendente' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ROTULO_ESTADO: Record<string, string> = {
  comparavel: 'comparável',
  sem_fator: 'sem fator: fora da comparação',
  preco_pendente: 'preço pendente',
  cancelado: 'cancelado: fora da média',
}

const ROTULO_CLASSE: Record<string, string> = {
  frete: 'Frete',
  servico: 'Serviço',
  nd: 'N-D',
  a_classificar: 'A classificar',
}

const HistoricoPrecos = () => {
  const [dados, setDados] = useState<RespostaHistorico | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [item, setItem] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback((filtro: { item?: string; de?: string; ate?: string }) => {
    obterHistorico(filtro)
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar o histórico agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar({})
  }, [carregar])

  const buscar = () => carregar({ item: item.trim(), de, ate })

  const classificar = async (chave: string, classificacao: string) => {
    setAviso(null)
    try {
      await classificarLinhaPreco({ chave, classificacao })
      setAviso('Linha classificada.')
      carregar({ item: item.trim(), de, ate })
    } catch {
      setAviso('Não foi possível classificar agora.')
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Histórico de preços</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Preço de compra por insumo e fornecedor, na unidade de estoque.
      </p>
      <ComoFunciona>
        <p>
          Os preços vêm dos pedidos de compra do Omie. Frete, serviço e N-D ficam fora do histórico
          do insumo, mas aparecem no documento.
        </p>
        <p>Sem fator confirmado o preço fica na unidade de compra e fora da comparação.</p>
      </ComoFunciona>
      {erro && (
        <div
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {erro}
        </div>
      )}
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}
      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input
              placeholder="Código do insumo no Omie"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <Input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} />
            <Input
              type="date"
              aria-label="Até"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
            <Button disabled={!item.trim()} onClick={buscar}>
              Ver histórico
            </Button>
          </div>
          {dados && (
            <p className="text-xs text-muted-foreground">
              {dados.ultima_atualizacao
                ? `Última atualização: ${new Date(dados.ultima_atualizacao).toLocaleString('pt-BR')}.`
                : 'Ainda não há pedidos de compra lidos do Omie.'}{' '}
              A classificar: {dados.pendencias.a_classificar}. Preços pendentes:{' '}
              {dados.pendencias.sem_preco}.
            </p>
          )}
        </CardContent>
      </Card>

      {dados?.item && (
        <>
          <h2 className="text-xl font-semibold mb-2">
            {dados.item}
            {dados.unidade_estoque ? ` — preço por ${dados.unidade_estoque}` : ''}
          </h2>
          {dados.resumo.geral && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(
                [
                  ['Menor', dados.resumo.geral.menor],
                  ['Maior', dados.resumo.geral.maior],
                  ['Média', dados.resumo.geral.media],
                  ['Último', dados.resumo.geral.ultimo],
                ] as [string, number][]
              ).map(([r, v]) => (
                <Card key={r}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs text-muted-foreground">{r}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg font-semibold">{moeda(v)}</CardContent>
                </Card>
              ))}
            </div>
          )}
          {!dados.resumo.geral && (
            <p className="text-sm mb-4">Nenhum preço comparável no período.</p>
          )}
          {dados.resumo.por_fornecedor.length > 0 && (
            <ul className="text-sm mb-4 space-y-1">
              {dados.resumo.por_fornecedor.map((f) => (
                <li key={String(f.fornecedor)}>
                  <strong>{f.fornecedor ?? 'fornecedor não informado'}</strong>: menor{' '}
                  {moeda(f.menor)}, maior {moeda(f.maior)}, média {moeda(f.media)} ({f.registros}{' '}
                  pedido
                  {f.registros === 1 ? '' : 's'})
                </li>
              ))}
            </ul>
          )}
          {dados.registros.length > 0 && (
            <div className="overflow-x-auto mb-6">
              <Table className="w-full text-sm text-left">
                <TableHeader>
                  <TableRow className="border-b text-xs text-muted-foreground">
                    <TableHead className="py-2 pr-3">Data</TableHead>
                    <TableHead className="py-2 pr-3">Fornecedor</TableHead>
                    <TableHead className="py-2 pr-3">Pedido</TableHead>
                    <TableHead className="py-2 pr-3">Quantidade</TableHead>
                    <TableHead className="py-2 pr-3">Preço</TableHead>
                    <TableHead className="py-2">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.registros.map((r) => (
                    <TableRow
                      key={r.chave}
                      className={`border-b align-top ${r.estado === 'comparavel' ? '' : 'text-muted-foreground'}`}
                    >
                      <td className="py-2 pr-3">
                        {r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="py-2 pr-3">{r.fornecedor ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono">{r.pedido_id}</td>
                      <td className="py-2 pr-3">
                        {r.quantidade ?? '—'} {r.unidade ?? ''}
                      </td>
                      <td className="py-2 pr-3">
                        {moeda(r.preco)}
                        {r.preco !== null && r.unidade ? ` / ${r.unidade}` : ''}
                      </td>
                      <td className="py-2">
                        <Badge variant="outline">
                          {ROTULO_ESTADO[r.estado] ?? rotuloEstado(r.estado)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dados.documentos.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">
                  No documento, fora do histórico do insumo
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {dados.documentos.map((d) => (
                  <div key={d.pedido_id + d.linha_id}>
                    Pedido {d.pedido_id}: {ROTULO_CLASSE[d.classificacao] ?? d.classificacao} —{' '}
                    {d.produto_id}, {d.quantidade ?? '—'} {d.unidade_compra ?? ''} a{' '}
                    {moeda(d.preco_unitario)}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {dados && dados.a_classificar.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Linhas a classificar ({dados.pendencias.a_classificar})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {dados.a_classificar.map((l) => (
              <div key={l.chave} className="flex flex-wrap items-center gap-2 border-b pb-2">
                <span className="font-mono">
                  Pedido {l.pedido_id} · {l.produto_id}
                </span>
                <span className="text-muted-foreground">
                  {l.quantidade ?? '—'} {l.unidade_compra ?? ''} a {moeda(l.preco_unitario)}
                </span>
                {dados.pode_classificar && (
                  <span className="flex gap-1 ml-auto">
                    {(
                      [
                        ['insumo', 'Insumo'],
                        ['frete', 'Frete'],
                        ['servico', 'Serviço'],
                        ['nd', 'N-D'],
                      ] as [string, string][]
                    ).map(([v, rotulo]) => (
                      <Button
                        key={v}
                        size="sm"
                        variant="outline"
                        onClick={() => classificar(l.chave, v)}
                      >
                        {rotulo}
                      </Button>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default HistoricoPrecos
