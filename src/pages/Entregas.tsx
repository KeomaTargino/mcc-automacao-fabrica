import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro } from '@/lib/pcp/textos'
import { obterEntregas, type EntregaCompra, type RespostaEntregas } from '@/services/pcp-compras'

const data = (iso: string | null) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : 'sem previsão'

const Entregas = () => {
  const [dados, setDados] = useState<RespostaEntregas | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    obterEntregas()
      .then(setDados)
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar as entregas agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  const porFornecedor = (dados?.entregas ?? []).reduce<Record<string, EntregaCompra[]>>(
    (acc, x) => {
      const k = x.fornecedor ?? 'não informado'
      ;(acc[k] = acc[k] ?? []).push(x)
      return acc
    },
    {},
  )

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Entregas de compra</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        O que está em aberto nos pedidos de compra do Omie. É só leitura.
      </p>
      <ComoFunciona>
        <p>
          Cada linha mostra pedido, item, data prevista, quantidade pedida, recebida, restante e
          dias de atraso. Nada é alterado no Omie por esta tela.
        </p>
      </ComoFunciona>
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {!erro && !dados && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {dados && (
        <p className="mb-4 text-xs text-muted-foreground">
          {dados.ultima_leitura
            ? `Última leitura do Omie: ${new Date(dados.ultima_leitura).toLocaleString('pt-BR')}.`
            : 'Os pedidos de compra ainda não foram lidos do Omie; a lista aparece quando a leitura estiver liberada.'}
        </p>
      )}
      {dados && dados.entregas.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">Nenhuma entrega para mostrar.</CardContent>
        </Card>
      )}
      {Object.entries(porFornecedor).map(([fornecedor, lista]) => {
        const r = dados?.resumo.find((x) => x.fornecedor === fornecedor)
        return (
          <section key={fornecedor} className="mb-6">
            <h2 className="text-xl font-semibold mb-2">
              {fornecedor}
              {r && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {r.em_aberto} em aberto, {r.atrasadas} atrasada{r.atrasadas === 1 ? '' : 's'}
                </span>
              )}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Pedido</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Previsto</th>
                    <th className="py-2 pr-3">Pedida</th>
                    <th className="py-2 pr-3">Recebida</th>
                    <th className="py-2 pr-3">Restante</th>
                    <th className="py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((x) => (
                    <tr key={x.pedido_id + x.linha_id} className="border-b align-top">
                      <td className="py-2 pr-3 font-mono">{x.numero ?? x.pedido_id}</td>
                      <td className="py-2 pr-3 font-mono">{x.produto_id}</td>
                      <td className="py-2 pr-3">{data(x.data_prevista)}</td>
                      <td className="py-2 pr-3">
                        {x.quantidade_pedida} {x.unidade ?? ''}
                      </td>
                      <td className="py-2 pr-3">{x.quantidade_recebida}</td>
                      <td className="py-2 pr-3">{x.restante}</td>
                      <td className="py-2 space-x-1">
                        {x.cancelado && <Badge variant="outline">cancelado</Badge>}
                        {x.atrasado && (
                          <Badge className="bg-red-100 text-red-900 border-red-300">
                            {x.dias_atraso} dia{x.dias_atraso === 1 ? '' : 's'} de atraso
                          </Badge>
                        )}
                        {x.emergencial && <Badge variant="outline">emergencial</Badge>}
                        {!x.cancelado && x.restante === 0 && (
                          <Badge variant="outline">recebido</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default Entregas
