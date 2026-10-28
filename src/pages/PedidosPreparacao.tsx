import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { obterPedidosPreparacao, type RespostaPedidosPreparacao } from '@/services/pcp-faturamento'

const moeda = (n: number | null) =>
  n === null ? 'pendente' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ORIGEM: Record<string, string> = {
  omie: 'Omie direto',
  lunet_pelo_omie: 'Lunet pelo Omie',
  nuvemshop: 'Nuvemshop',
  manual: 'Manual',
  a_confirmar: 'Origem a confirmar',
}

const PedidosPreparacao = () => {
  const [dados, setDados] = useState<RespostaPedidosPreparacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    obterPedidosPreparacao()
      .then(setDados)
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? 'Sua conta não tem acesso a esta tela.'
            : 'Não foi possível carregar os pedidos agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Preparação de pedidos</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cada pedido com a unidade, a tabela de preço vigente, o subtotal recalculado ao lado do
        subtotal do pedido e a origem. Preço diferente da tabela aparece e não é trocado; nada é
        alterado no Omie.
      </p>
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {!erro && !dados && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {dados && !dados.disponivel && (
        <Card>
          <CardContent className="py-6 text-sm">{dados.motivo}</CardContent>
        </Card>
      )}
      {dados?.disponivel && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {dados.totais?.pedidos} pedidos · {dados.totais?.sem_unidade} sem unidade cadastrada ·{' '}
            {dados.totais?.nomes_a_revisar} nomes de canal a revisar.{' '}
            {dados.ultimo_sucesso
              ? `Última leitura: ${new Date(dados.ultimo_sucesso).toLocaleString('pt-BR')}.`
              : ''}
          </p>
          {dados.aviso && <p className="mb-4 text-xs text-amber-800">{dados.aviso}</p>}
          <div className="space-y-3">
            {dados.pedidos?.map((p) => (
              <Card key={p.pedido_id}>
                <CardHeader>
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    <span className="font-mono">Pedido {p.pedido_id}</span>
                    <Badge variant="outline">{ORIGEM[p.origem] ?? p.origem}</Badge>
                    {p.situacao_canal === 'intencao' && (
                      <Badge variant="outline">intenção (não pago)</Badge>
                    )}
                    {p.apto_para_preparar ? (
                      <Badge>apto</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300">
                        não apto
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div>
                    {p.unidade
                      ? `${p.unidade} — ${p.nome_fantasia_operacional}`
                      : 'Unidade não cadastrada'}
                  </div>
                  {p.motivos.map((m) => (
                    <div key={m} className="text-xs text-amber-800">
                      {m}
                    </div>
                  ))}
                  {p.itens.map((i) => (
                    <div key={i.item} className="flex flex-wrap gap-2">
                      <span className="font-mono">{i.item}</span>
                      <span>
                        {i.quantidade} × pedido {moeda(i.preco_pedido)} / tabela{' '}
                        {moeda(i.preco_tabela)}
                      </span>
                      {i.diferente_da_tabela && (
                        <Badge variant="outline" className="border-red-400 text-red-900">
                          preço diferente da tabela
                        </Badge>
                      )}
                    </div>
                  ))}
                  <div>
                    Subtotal recalculado: <strong>{moeda(p.subtotal_recalculado)}</strong> ·
                    subtotal do pedido: <strong>{moeda(p.subtotal_pedido)}</strong>
                    {p.diferenca !== null && p.diferenca !== 0 && (
                      <span className="text-red-800"> · diferença de {moeda(p.diferenca)}</span>
                    )}
                    {p.subtotal_pendente.length > 0 && (
                      <span className="text-amber-800">
                        {' '}
                        · sem preço na tabela: {p.subtotal_pendente.join(', ')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default PedidosPreparacao
