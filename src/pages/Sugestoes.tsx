import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  calcularSugestaoProducao,
  calcularSugestaoCompra,
  FIXTURE_T1,
  FIXTURE_T2,
  FIXTURE_T4,
  FIXTURE_COMPRA,
  FIXTURE_COMPRA_LOTE_MINIMO,
  type Sugestao,
  type EntradasProducao,
} from '@/lib/pcp/sugestao'

const CASOS: { rotulo: string; calcular: () => Sugestao }[] = [
  {
    rotulo: 'COOKIE-1 · T1: projeção 70 × firmes 50 → alvo 70 → necessidade 50 → sugestão 50 UN',
    calcular: () => calcularSugestaoProducao('S-T1', 'COOKIE-1', FIXTURE_T1),
  },
  {
    rotulo: 'COOKIE-1 · T2: firmes 80 vencem projeção (máximo, não soma) → necessidade 60 UN',
    calcular: () => calcularSugestaoProducao('S-T2', 'COOKIE-1', FIXTURE_T2),
  },
  {
    rotulo: 'COOKIE-1 · T4: necessidade 51 → lote 60; capacidade 50 → excedente 10 UN',
    calcular: () => calcularSugestaoProducao('S-T4', 'COOKIE-1', FIXTURE_T4),
  },
  {
    rotulo: 'COOKIE-1 · T6: mapa de pedidos firmes ausente → bloqueada (null, nunca default)',
    calcular: () =>
      calcularSugestaoProducao('S-T6', 'COOKIE-1', {
        ...FIXTURE_T1,
        pedidos_firmes_no_horizonte: null,
      }),
  },
  {
    rotulo: 'FARINHA · compra: falta 4,8 KG → lote mínimo 3 e múltiplo 2 → sugestão 6 KG',
    calcular: () => calcularSugestaoCompra('C-T1', 'FARINHA', FIXTURE_COMPRA),
  },
  {
    rotulo: 'ACUCAR · compra: falta 1 KG com lote mínimo 5 → sugestão 6 KG',
    calcular: () => calcularSugestaoCompra('C-T2', 'ACUCAR', FIXTURE_COMPRA_LOTE_MINIMO),
  },
  {
    rotulo: 'OLEO · compra: recebimentos a receber desconhecidos → bloqueada (não vira 0)',
    calcular: () =>
      calcularSugestaoCompra('C-NULL', 'OLEO', {
        ...FIXTURE_COMPRA,
        compras_confirmadas_a_receber: null,
      }),
  },
]

const Sugestoes = () => {
  const [aberta, setAberta] = useState<string | null>(null)
  const sugestoes = useMemo(() => CASOS.map((c) => ({ rotulo: c.rotulo, s: c.calcular() })), [])
  const abertaObj = sugestoes.find((x) => x.s.id === aberta)

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Sugestões com memória de cálculo</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Método proposto baseline90-v1 (ainda não aprovado como regra empresarial — a aprovação do
        CL-006 é outra task). Aceitar sugestão não publica programação nem envia compra.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> Casos sintéticos com fixtures isoladas (oráculos
        T1/T2/T4/T6 da SPEC). Os cálculos com dados reais (90 dias de Omie) vêm depois da aprovação
        do método e da conexão real.
      </div>

      <div className="space-y-3">
        {sugestoes.map(({ s, rotulo }) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{rotulo}</span>
                {s.estado === 'calculada' ? (
                  <Badge className="bg-green-100 text-green-900 border-green-300">
                    {s.quantidade} {s.unidade}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 text-amber-900">
                    Bloqueada (null)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAberta(aberta === s.id ? null : s.id)}
                >
                  {aberta === s.id ? 'Ocultar memória' : 'Ver memória de cálculo'}
                </Button>
                <Button
                  size="sm"
                  disabled
                  title="Aceitar → rascunho é a próxima task (8bb4ef77); aqui nada é publicado nem comprado"
                >
                  Aceitar (desabilitado na demo)
                </Button>
              </div>
              {aberta === s.id && s.memoria && (
                <div className="rounded-md border px-3 py-2 text-xs bg-muted space-y-1">
                  <p>
                    <strong>Fórmula:</strong> {s.memoria.formula_id} · <strong>Versão:</strong>{' '}
                    {s.memoria.versao_parametros}
                  </p>
                  <table className="w-full">
                    <tbody>
                      {s.memoria.passos.map((p) => (
                        <tr key={p.nome}>
                          <td className="py-0.5 pr-2 font-mono">{p.nome}</td>
                          <td className="py-0.5 pr-2">{p.valor ?? 'null'}</td>
                          <td className="py-0.5 text-muted-foreground">{p.formula}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {s.memoria.pendencias.length > 0 && (
                    <ul className="list-disc list-inside text-amber-800">
                      {s.memoria.pendencias.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {abertaObj && (
        <p className="mt-4 text-xs text-muted-foreground">
          Memória reproduzível: mesmas entradas → mesmos passos (determinismo provado no TDD).
        </p>
      )}
    </div>
  )
}

export default Sugestoes
