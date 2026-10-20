import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  registrarEvento,
  retificarEvento,
  consumoLiquido,
  OP_DEMO,
  FICHA_DEMO,
  SESSAO_DEMO,
  type EventoApontamento,
  type TipoEvento,
  type Ponto,
} from '@/lib/pcp/apontamento'
import {
  somaRealizadoPonto,
  projetarOP,
  encerrarPonto,
  podeRegistrarAposEncerramento,
  type EventoPonto,
} from '@/lib/pcp/ponto'

const TIPOS: { tipo: TipoEvento; rotulo: string }[] = [
  { tipo: 'retirada', rotulo: 'Retirada' },
  { tipo: 'adicional', rotulo: 'Adicional' },
  { tipo: 'devolucao', rotulo: 'Devolução' },
  { tipo: 'perda', rotulo: 'Perda declarada' },
  { tipo: 'realizado', rotulo: 'Realizado' },
]

const Apontamentos = () => {
  const [eventos, setEventos] = useState<EventoApontamento[]>([])
  const [tipo, setTipo] = useState<TipoEvento>('retirada')
  const [quantidade, setQuantidade] = useState('1')
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState('')
  const [opPublicada] = useState(OP_DEMO.estado)

  // ---- Task 64ac4f85: produção por ponto (oráculos da SPEC-2-003) ----
  const EP = (id: string, tipo: any, qtd: number, extra: any = {}): EventoPonto => ({
    id,
    op_id: 'OP-1',
    op_versao: 1,
    tipo,
    item: tipo.startsWith('realizado') ? null : 'INS-1',
    quantidade: qtd,
    unidade: tipo.startsWith('realizado') ? 'UN' : 'KG',
    ponto:
      tipo === 'realizado_cozinha'
        ? 'cozinha'
        : tipo === 'realizado_encaixotamento'
          ? 'encaixotamento'
          : 'cozinha',
    autor: 'demonstracao',
    criado_em: new Date().toISOString(),
    ...extra,
  })
  const eventosPonto: EventoPonto[] = [
    EP('d1', 'retirada', 6),
    EP('d2', 'realizado_cozinha', 40),
    EP('d3', 'realizado_cozinha', 60, { autor: 'equipe' }),
    EP('d4', 'realizado_encaixotamento', 98, { ponto: 'encaixotamento' }),
  ]
  const FICHA_PONTO = {
    base_produto: 100,
    unidade_produto: 'UN',
    componente: { insumo: 'INS-1', quantidade: 5, unidade: 'KG' },
  }
  const projecao = projetarOP(eventosPonto, FICHA_PONTO)
  const encerraCozinha = () =>
    encerrarPonto({
      eventos: eventosPonto,
      ponto: 'cozinha',
      ficha: FICHA_PONTO,
      sessao: { pontos: ['cozinha', 'encaixotamento'] },
      encerramentos: [],
      estadoOP: 'publicada',
      envio: null,
      autor: 'demonstracao',
    })
  const congelado = podeRegistrarAposEncerramento({ encerrado: true, envio: 'enviando' })
  const invalidacao = podeRegistrarAposEncerramento({ encerrado: true, envio: null })
  const somaCozinha = somaRealizadoPonto(eventosPonto, 'cozinha')
  const somaEncaix = somaRealizadoPonto(eventosPonto, 'encaixotamento')
  const ins = projecao.consumo.find((c) => c.item === 'INS-1')
  const encerramento = encerraCozinha()
  const hashEncerramento = encerramento.estado !== 'negado' ? encerramento.registro.hash : '—'

  const realizadoEficaz = useMemo(
    () =>
      eventos
        .filter((e) => e.tipo === 'realizado' && !eventos.some((x) => x.retifica === e.evento_id))
        .reduce((s, e) => s + e.quantidade, 0),
    [eventos],
  )
  const consumo = useMemo(
    () =>
      consumoLiquido(
        eventos,
        FICHA_DEMO,
        realizadoEficaz,
        realizadoEficaz > 0 || eventos.some((e) => e.tipo === 'realizado') ? 'UN' : null,
      ),
    [eventos, realizadoEficaz],
  )

  const registrar = () => {
    const q = Number(quantidade)
    const id = `EV-${Date.now()}`
    const r = registrarEvento(
      {
        evento_id: id,
        op_id: OP_DEMO.op_id,
        ponto: 'cozinha' as Ponto,
        tipo,
        item: tipo === 'realizado' ? 'COOKIE-1' : 'INS-1',
        quantidade: q,
        unidade: tipo === 'realizado' ? 'UN' : 'KG',
        motivo: motivo || undefined,
        autor: 'demonstracao',
      },
      opPublicada,
      eventos,
      SESSAO_DEMO,
    )
    if (r.estado === 'registrado') {
      setEventos([...eventos, r.evento])
      setResultado(
        `Registrado: ${r.evento.tipo} ${r.evento.quantidade} ${r.evento.unidade} (recibo ${id.slice(0, 13)}…).`,
      )
      setMotivo('')
    } else if (r.estado === 'replay') {
      setResultado('Repetição ignorada: o evento já estava registrado (idempotência).')
    } else {
      setResultado(`${r.estado}: ${r.motivo}`)
    }
  }

  const retificar = (e: EventoApontamento) => {
    const nova = window.prompt('Nova quantidade (motivo será pedido a seguir):')
    if (nova === null) return
    const q = Number(nova)
    const m = window.prompt('Motivo da retificação (obrigatório):')
    if (!m) {
      setResultado('negado: Retificação exige motivo.')
      return
    }
    const r = retificarEvento(e, q, m, `EV-RET-${Date.now()}`, opPublicada, eventos, SESSAO_DEMO)
    if (r.estado === 'registrado') {
      setEventos([...eventos, r.evento])
      setResultado(`Retificado: ${e.quantidade} → ${q} (original preservado no histórico).`)
    } else {
      setResultado(`${r.estado}: ${r.motivo}`)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Apontamentos na origem</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Retirada, adicional, devolução, perda declarada e realizado — com autor, OP, unidade e
        ponto. Eventos são imutáveis: correção cria retificação auditável.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> OP sintética {OP_DEMO.op_id} (COOKIE-1), ficha 100 UN
        → 5 KG de INS-1, ponto cozinha. A ligação com a OP publicada real e os acessos por ponto
        reais vêm na próxima task da fase.
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            Produção por ponto — oráculos da SPEC-2-003 (64ac4f85)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            Incrementos por execução: cozinha 40 + 60 = <strong>{somaCozinha}</strong> (não
            substituem) · encaixotamento <strong>{somaEncaix}</strong> (registro independente) ·
            previsto pela ficha (só cozinha): <strong>{projecao.previsto} KG</strong> · retirada 6
            KG → líquido {ins?.liquido} = diferença <strong>+{ins?.diferenca}</strong>.
          </p>
          <p>
            Encerramento do ponto cozinha: <strong>{encerramento.estado}</strong> com hash{' '}
            <span className="font-mono text-xs">{hashEncerramento.slice(0, 34)}…</span> · declaração
            zero com motivo encerra · sem realizado (ou zero sem motivo) nega · evento após
            encerramento invalida{' '}
            <strong>{invalidacao.ok ? invalidacao.invalida.join(' + ') : '—'}</strong> · durante
            envio/incerto:{' '}
            <strong>{congelado.ok ? 'permitido' : congelado.motivo.slice(0, 60)}</strong>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1">
              {TIPOS.map((t) => (
                <Button
                  key={t.tipo}
                  size="sm"
                  variant={tipo === t.tipo ? 'default' : 'outline'}
                  onClick={() => setTipo(t.tipo)}
                >
                  {t.rotulo}
                </Button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground">
                Quantidade ({tipo === 'realizado' ? 'UN' : 'KG'})
              </span>
              <Input
                type="number"
                step="0.1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </label>
            {(tipo === 'realizado' || Number(quantidade) === 0) && (
              <label className="block space-y-1">
                <span className="text-muted-foreground">Motivo (obrigatório para realizado 0)</span>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: linha parada por manutenção"
                />
              </label>
            )}
            <Button size="sm" onClick={registrar}>
              Registrar
            </Button>
            {resultado && (
              <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
                {resultado}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumo por item (ficha: 100 UN → 5 KG)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {consumo.length === 0 && (
              <p className="text-muted-foreground">Nenhum evento de consumo ainda.</p>
            )}
            {consumo.map((c) => (
              <div key={`${c.item}|${c.unidade}`} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between">
                  <strong>
                    {c.item} <span className="font-mono text-xs">({c.unidade})</span>
                  </strong>
                  {c.calculo_disponivel ? (
                    <Badge
                      className={
                        Math.abs(c.diferenca ?? 0) < 1e-9
                          ? 'bg-green-100 text-green-900 border-green-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }
                    >
                      {c.diferenca! > 0 ? '+' : ''}
                      {c.diferenca!.toFixed(2)} vs previsto
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-900">
                      cálculo indisponível
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Líquido {c.liquido.toFixed(2)} = retiradas {c.retiradas.toFixed(2)} + adicionais{' '}
                  {c.adicionais.toFixed(2)} − devoluções {c.devolucoes.toFixed(2)}
                  {c.calculo_disponivel && ` · previsto ${(c.previsto ?? 0).toFixed(2)}`}
                </p>
                {c.perda_declarada > 0 && (
                  <p className="text-xs text-orange-700">
                    Perda declarada (separada, não somada ao líquido):{' '}
                    {c.perda_declarada.toFixed(2)}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Eventos da OP ({eventos.length}) — imutáveis</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {eventos.length === 0 && (
            <p className="text-muted-foreground">Nenhum evento registrado.</p>
          )}
          {eventos.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Item</th>
                  <th className="pb-2">Qtd</th>
                  <th className="pb-2">Ponto</th>
                  <th className="pb-2">Retifica</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.evento_id} className={e.retifica ? 'opacity-60' : ''}>
                    <td className="py-1 font-mono text-xs">{e.evento_id.slice(0, 14)}…</td>
                    <td>
                      {e.tipo}
                      {e.retifica && (
                        <span className="ml-1 text-xs text-muted-foreground">(retificação)</span>
                      )}
                    </td>
                    <td>{e.item}</td>
                    <td>
                      {e.quantidade} {e.unidade}
                    </td>
                    <td>{e.ponto}</td>
                    <td className="font-mono text-xs">
                      {e.retifica ? e.retifica.slice(0, 10) + '…' : '—'}
                    </td>
                    <td>
                      {!e.retifica && (
                        <Button variant="outline" size="sm" onClick={() => retificar(e)}>
                          Retificar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Apontamentos
