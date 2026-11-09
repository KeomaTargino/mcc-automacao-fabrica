import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { semInformacao, textoSeguro } from '@/lib/pcp/textos'
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
import {
  aceitarSugestao,
  publicarRascunho,
  type SugestaoAceitavel,
  type Rascunho,
} from '@/lib/pcp/rascunho'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const CASOS: { rotulo: string; calcular: () => Sugestao }[] = [
  {
    rotulo: 'Cookie · projeção 70 e pedidos firmes 50 → alvo 70 → faltam 50 → sugestão de 50 UN',
    calcular: () => calcularSugestaoProducao('S-T1', 'COOKIE-1', FIXTURE_T1),
  },
  {
    rotulo: 'Cookie · pedidos firmes 80 vencem a projeção (vale o maior, não soma) → faltam 60 UN',
    calcular: () => calcularSugestaoProducao('S-T2', 'COOKIE-1', FIXTURE_T2),
  },
  {
    rotulo: 'Cookie · faltam 51 → lote de 60; capacidade 50 → 10 UN acima da capacidade',
    calcular: () => calcularSugestaoProducao('S-T4', 'COOKIE-1', FIXTURE_T4),
  },
  {
    rotulo: 'Cookie · pedidos firmes sem informação → bloqueada (nada é preenchido sozinho)',
    calcular: () =>
      calcularSugestaoProducao('S-T6', 'COOKIE-1', {
        ...FIXTURE_T1,
        pedidos_firmes_no_horizonte: null,
      }),
  },
  {
    rotulo: 'Farinha · compra: faltam 4,8 KG → lote mínimo 3 e múltiplo 2 → sugestão de 6 KG',
    calcular: () => calcularSugestaoCompra('C-T1', 'FARINHA', FIXTURE_COMPRA),
  },
  {
    rotulo: 'Açúcar · compra: falta 1 KG com lote mínimo 5 → sugestão de 6 KG',
    calcular: () => calcularSugestaoCompra('C-T2', 'ACUCAR', FIXTURE_COMPRA_LOTE_MINIMO),
  },
  {
    rotulo: 'Óleo · compra: recebimentos a receber sem informação → bloqueada (não vira zero)',
    calcular: () =>
      calcularSugestaoCompra('C-T3', 'OLEO', {
        ...FIXTURE_COMPRA,
        compras_confirmadas_a_receber: null,
      }),
  },
]

const Sugestoes = () => {
  const [aberta, setAberta] = useState<string | null>(null)
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([])
  const [msgAceitar, setMsgAceitar] = useState('')
  const sugestoes = useMemo(() => CASOS.map((c) => ({ rotulo: c.rotulo, s: c.calcular() })), [])
  const abertaObj = sugestoes.find((x) => x.s.id === aberta)

  const aceitar = (s: Sugestao) => {
    if (s.estado !== 'calculada' || s.quantidade === null) {
      setMsgAceitar('Sugestão bloqueada não pode ser aceita.')
      return
    }
    const aceitavel: SugestaoAceitavel = {
      id: s.id,
      tipo: s.tipo,
      item: s.item,
      unidade: s.unidade,
      quantidade: s.quantidade,
      hash_conteudo: JSON.stringify([s.tipo, s.item, s.quantidade, s.unidade]),
      versao_parametros: s.memoria.versao_parametros,
      estado: s.estado,
    }
    // Demonstração: o dono tem editar_programacao na matriz v1.2.
    const r = aceitarSugestao(
      aceitavel,
      { acoes: ['editar_programacao'], usuario: 'dono' },
      rascunhos,
    )
    if (r.estado === 'rascunho_criado') {
      setRascunhos([...rascunhos, r.rascunho])
      setMsgAceitar(
        `Rascunho criado: ${r.rascunho.item} ${r.rascunho.quantidade} ${r.rascunho.unidade} — NÃO publica e NÃO envia compra.`,
      )
    } else if (r.estado === 'replay') {
      setMsgAceitar('Já registrado: este rascunho já existia.')
    } else {
      setMsgAceitar(textoSeguro(r.motivo, 'Não foi possível aceitar esta sugestão.'))
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Sugestões com memória de cálculo</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Sugestões de produção e de compra, com a conta mostrada passo a passo.
      </p>
      <ComoFunciona>
        <p>
          O método proposto (baseline90-v1) ainda não foi aprovado como regra da empresa. Aceitar
          uma sugestão não publica programação nem envia compra.
        </p>
      </ComoFunciona>

      <div
        className="mb-6 rounded-md border border-info/30 bg-info/10 px-4 py-3 text-sm text-info"
        role="status"
      >
        <strong>Dados de demonstração.</strong> Casos de exemplo. Os cálculos com os 90 dias reais
        do Omie vêm depois da aprovação do método e da conexão real.
      </div>

      <div className="space-y-3">
        {sugestoes.map(({ s, rotulo }) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{rotulo}</span>
                {s.estado === 'calculada' ? (
                  <Badge className="bg-success/10 text-success border-success/30">
                    {s.quantidade} {s.unidade}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/30 text-warning">
                    Bloqueada
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
                <Button size="sm" disabled title="Nesta demonstração nada é publicado nem comprado">
                  Aceitar (indisponível na demonstração)
                </Button>
              </div>
              {aberta === s.id && s.memoria && (
                <div className="rounded-md border px-3 py-2 text-xs bg-muted space-y-1">
                  <p>
                    <strong>Fórmula:</strong> {s.memoria.formula_id} · <strong>Versão:</strong>{' '}
                    {s.memoria.versao_parametros}
                  </p>
                  <Table className="w-full">
                    <TableBody>
                      {s.memoria.passos.map((p) => (
                        <TableRow key={p.nome}>
                          <TableCell className="py-0.5 pr-2">
                            {String(p.nome).replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="py-0.5 pr-2">
                            {p.valor ?? semInformacao()}
                          </TableCell>
                          <TableCell className="py-0.5 text-muted-foreground">
                            {p.formula}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {s.memoria.pendencias.length > 0 && (
                    <ul className="list-disc list-inside text-warning">
                      {s.memoria.pendencias.map((p, i) => (
                        <li key={i}>{textoSeguro(p, 'Há uma pendência neste cálculo.')}</li>
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
          A conta é reproduzível: as mesmas entradas dão sempre os mesmos passos.
        </p>
      )}

      {msgAceitar && (
        <div className="mt-4 rounded-md border px-3 py-2 text-xs bg-muted" role="status">
          {msgAceitar}
        </div>
      )}

      {rascunhos.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Rascunhos criados ({rascunhos.length}) — nenhum publicado, nenhuma compra enviada
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="text-left text-muted-foreground">
                  <TableHead className="pb-2">Sugestão</TableHead>
                  <TableHead className="pb-2">Item</TableHead>
                  <TableHead className="pb-2">Qtd</TableHead>
                  <TableHead className="pb-2">Publicado</TableHead>
                  <TableHead className="pb-2">Compra enviada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rascunhos.map((r) => (
                  <TableRow key={r.rascunho_id}>
                    <TableCell className="py-1 font-mono text-xs">{r.sugestao_id}</TableCell>
                    <TableCell>{r.item}</TableCell>
                    <TableCell>
                      {r.quantidade} {r.unidade}
                    </TableCell>
                    <TableCell>não (bloqueado)</TableCell>
                    <TableCell>não (bloqueado)</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Sugestoes
