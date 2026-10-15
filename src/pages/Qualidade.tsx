import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  produtosDemonstracao,
  eventosDemonstracao,
  producaoLiquida,
  HORIZONTE_DEMO,
  rotuloBloqueio,
} from '@/lib/pcp/qualidade'

const COR_BLOQUEIO: Record<string, string> = {
  calculo_estoque: 'bg-amber-100 text-amber-900 border-amber-300',
  calculo_receita: 'bg-orange-100 text-orange-900 border-orange-300',
  calculo_sugestao: 'bg-red-100 text-red-900 border-red-300',
}

const ROTULO_BLOQUEIO_CURTO: Record<string, string> = {
  calculo_estoque: 'Estoque bloqueado',
  calculo_receita: 'Receita bloqueada',
  calculo_sugestao: 'Sugestões bloqueadas',
}

const Qualidade = () => {
  const produtos = useMemo(() => produtosDemonstracao(), [])
  const mapa = useMemo(() => producaoLiquida(eventosDemonstracao(), HORIZONTE_DEMO), [])
  const cookie = mapa.find((x) => x.produto_id === 'COOKIE-1')

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Qualidade dos dados</h1>
      <p className="text-sm text-muted-foreground mb-6">
        O que cada cálculo pode usar hoje — e o que está bloqueado porque um dado oficial está
        ausente ou incompleto. Nada é presumido: dado desconhecido aparece como “desconhecido”.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> Os produtos abaixo são exemplos isolados (fixtures) —
        não são produtos reais do cadastro. Quando o cadastro do Omie for povoado e as conexões
        reais forem liberadas, esta visão passa a mostrar os dados oficiais.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {produtos.map((p) => (
          <Card key={p.produto_id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>
                  {p.descricao} <span className="font-mono text-xs">({p.codigo})</span>
                </span>
                {p.bloqueios.length === 0 ? (
                  <Badge className="bg-green-100 text-green-900 border-green-300">
                    Pronto para calcular
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 text-amber-900">
                    {p.bloqueios.length} bloqueio(s)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Unidade oficial:</span>{' '}
                  {p.unidade_oficial ? (
                    <strong>{p.unidade_oficial}</strong>
                  ) : (
                    <span className="text-amber-700 font-medium">desconhecida</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Ficha técnica:</span>{' '}
                  {p.ficha ? (
                    <span>
                      {p.ficha.componentes.length} componente(s)
                      <span className="block text-xs text-muted-foreground">
                        {p.ficha.componentes
                          .map((c) => `${c.insumo} ${c.quantidade} ${c.unidade}`)
                          .join(', ')}
                      </span>
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium">ausente</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Cobertura do histórico:</span>{' '}
                  {p.cobertura_dias !== null
                    ? `${p.cobertura_dias} de ${p.cobertura_esperada} dias`
                    : 'desconhecida'}
                </div>
              </div>

              {p.bloqueios.length > 0 && (
                <div className="space-y-1 pt-1">
                  {p.bloqueios.map((b) => (
                    <div
                      key={b}
                      className={`rounded-md border px-3 py-2 text-xs ${COR_BLOQUEIO[b]}`}
                      role="alert"
                    >
                      <strong>{ROTULO_BLOQUEIO_CURTO[b]}:</strong> {rotuloBloqueio(b)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {cookie && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Mapa de produção líquida (demonstração) — {cookie.produto_id}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Histórico de {HORIZONTE_DEMO.inicio} a {HORIZONTE_DEMO.fim} (90 dias):{' '}
              <strong>{cookie.liquido} UN líquidas</strong> = {cookie.concluidas} concluídas −{' '}
              {cookie.canceladas} canceladas + {cookie.devolucoes} devoluções vinculadas.
            </p>
            <p className="text-xs text-muted-foreground">
              Cada evento entra uma única vez por chave (replay não duplica); eventos fora do
              horizonte são excluídos ({cookie.eventos_fora_do_horizonte} nesta demonstração).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Qualidade
