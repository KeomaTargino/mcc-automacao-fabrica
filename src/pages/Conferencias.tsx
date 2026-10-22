import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  registrarConferencia,
  montarFila,
  OP_CONFERENCIA_DEMO,
  SESSAO_EXPEDICAO,
  SESSAO_CAMARA,
  type RegistroConferencia,
  type EtapaConferencia,
  type PontoConferencia,
} from '@/lib/pcp/conferencia'
import { obterPerfil } from '@/services/pcp-access'
import {
  aprovarConsolidacao,
  invalidarPorNovaProjecao,
  retificarAntesDaAquisicao,
  type AprovacaoConsolidacao,
} from '@/lib/pcp/revisao-consolidacao'

const Conferencias = () => {
  const [registros, setRegistros] = useState<RegistroConferencia[]>([])
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState('')
  // Demonstração: produzido/encaixotados sintéticos (o real vem da OP publicada na task d77447ab)
  const [produzido] = useState(100)
  const [encaixotado] = useState(98)
  const [podeConferir, setPodeConferir] = useState(false)
  const [aprovacao, setAprovacao] = useState<AprovacaoConsolidacao | null>(null)
  const [qtdFinal, setQtdFinal] = useState('96')
  const [motivoAprov, setMotivoAprov] = useState('')
  const [msgAprov, setMsgAprov] = useState('')
  const inputQtd = useRef<HTMLInputElement>(null)

  const aprovar = () => {
    const q = Number(qtdFinal)
    const ausencia =
      fila.quantidades.recebido_expedicao === null || fila.quantidades.entrada_camara === null
    const r = aprovarConsolidacao(
      {
        aprovacao_id: `AP-${OP_CONFERENCIA_DEMO.op_id}-${OP_CONFERENCIA_DEMO.versao_op}`,
        op_id: OP_CONFERENCIA_DEMO.op_id,
        versao_op: OP_CONFERENCIA_DEMO.versao_op,
        quantidade_final: q,
        motivo: motivoAprov || 'revisão do PCP (demonstração)',
        aprovador: 'keoma.targino',
        hash_eventos: 'demo-eventos',
        hash_conferencias: 'demo-conferencias-' + registros.length,
      },
      { acoes: ['aprovar_consolidacao'], usuario: 'keoma.targino' },
      { estado: fila.estado === 'revisavel' ? 'revisavel' : 'bloqueada', ausencia },
    )
    if (r.estado === 'autorizada') {
      setAprovacao(r.aprovacao)
      const p = (r.aprovacao as any).pendencias
      setMsgAprov(
        `Aprovação registrada: final ${r.aprovacao.quantidade_final} UN com hashes.` +
          (Array.isArray(p) && p.length > 0
            ? ` PENDÊNCIA: ${p[0]}`
            : ' Liberada para revisão/envio (gate da SPEC-2-005).'),
      )
    } else {
      setMsgAprov(`${r.estado}: ${r.motivo}`)
    }
  }

  const invalidar = () => {
    if (!aprovacao) return
    const r = invalidarPorNovaProjecao(aprovacao, 'demo-conferencias-' + (registros.length + 1))
    if (r.estado === 'invalidada') {
      setAprovacao(r.aprovacao)
      setMsgAprov(r.motivo)
    } else {
      setMsgAprov(r.motivo)
    }
  }

  useEffect(() => {
    obterPerfil()
      .then((r: any) => {
        const acoes: string[] = r?.perfil?.acoes ?? []
        setPodeConferir(acoes.includes('conferir_expedicao'))
      })
      .catch(() => setPodeConferir(false))
  }, [])

  const fila = useMemo(
    () => montarFila(OP_CONFERENCIA_DEMO, produzido, encaixotado, registros),
    [produzido, encaixotado, registros],
  )

  // Última conferência VIGENTE por etapa (a fila usa a última — feedback visual do botão).
  const ultima = useMemo(
    () => ({
      expedicao:
        [...registros].reverse().find((r) => r.etapa === 'recebimento_expedicao')?.quantidade ??
        null,
      camara:
        [...registros].reverse().find((r) => r.etapa === 'entrada_camara')?.quantidade ?? null,
    }),
    [registros],
  )

  const registrar = (etapa: EtapaConferencia) => {
    const q = Number(quantidade)
    if (quantidade.trim() === '' || !Number.isFinite(q) || q < 0) {
      setResultado(
        'Digite a quantidade conferida antes de registrar (nada é preenchido por padrão).',
      )
      inputQtd.current?.focus()
      return
    }
    const ponto: PontoConferencia = etapa === 'recebimento_expedicao' ? 'expedicao' : 'camara_fria'
    const sessao = etapa === 'recebimento_expedicao' ? SESSAO_EXPEDICAO : SESSAO_CAMARA
    const r = registrarConferencia(
      {
        conferencia_id: `CF-${Date.now()}`,
        op_id: OP_CONFERENCIA_DEMO.op_id,
        versao_op: OP_CONFERENCIA_DEMO.versao_op,
        etapa,
        ponto,
        quantidade: q,
        unidade: 'UN',
        local: etapa === 'recebimento_expedicao' ? 'doca' : 'camara-1',
        conferente: 'demonstracao',
        motivo: motivo || undefined,
      },
      registros,
      sessao,
    )
    if (r.estado === 'registrado') {
      setRegistros([...registros, r.registro])
      setResultado(
        `Registrado: ${etapa === 'recebimento_expedicao' ? 'expedição' : 'câmara'} ${q} UN. Digite a quantidade da próxima etapa.`,
      )
      setMotivo('')
      setQuantidade('') // campo limpo: a próxima conferência é digitada, nunca puxada
      inputQtd.current?.focus()
    } else if (r.estado === 'replay') {
      setResultado('Repetição ignorada: a conferência já estava registrada (idempotência).')
    } else {
      setResultado(`${r.estado}: ${r.motivo}`)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Dupla conferência</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Produzido, encaixotado, recebido (expedição) e entrada em câmara são registros distintos. A
        divergência não é corrigida aqui: vai para revisão do PCP.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> OP sintética {OP_CONFERENCIA_DEMO.op_id} (v
        {OP_CONFERENCIA_DEMO.versao_op}) com produzido {produzido} UN e encaixotado {encaixotado} UN
        de exemplo. As conferências reais com etapas encerradas e pontos nominais vêm na próxima
        task da fase.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar conferência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => registrar('recebimento_expedicao')}
                disabled={!podeConferir}
                className={
                  ultima.expedicao !== null
                    ? 'bg-green-600 text-white hover:bg-green-700 border-green-700'
                    : undefined
                }
              >
                Conferir expedição{ultima.expedicao !== null ? `: ${ultima.expedicao} UN` : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => registrar('entrada_camara')}
                disabled={!podeConferir}
                className={
                  ultima.camara !== null
                    ? 'bg-green-600 text-white hover:bg-green-700 border-green-700'
                    : undefined
                }
              >
                Conferir câmara{ultima.camara !== null ? `: ${ultima.camara} UN` : ''}
              </Button>
            </div>
            {!podeConferir && (
              <p className="text-xs text-amber-700" role="note">
                Modo visualização: seu perfil não tem a ação conferir_expedicao (conforme a matriz
                de acesso). Na conferência real, quem conferi é Angela, Cristiano ou Kevin.
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-muted-foreground">Quantidade conferida (UN)</span>
              <Input
                ref={inputQtd}
                type="number"
                step="1"
                min="0"
                placeholder="Digite a quantidade conferida"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground">Motivo (obrigatório para quantidade 0)</span>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: nada recebido — OP não chegou à doca"
              />
            </label>
            {resultado && (
              <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
                {resultado}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span>Fila de consolidação</span>
              {fila.estado === 'revisavel' ? (
                <Badge className="bg-green-100 text-green-900 border-green-300">Revisável</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-900">
                  Bloqueada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Etapa</th>
                  <th className="pb-2">Qtd (UN)</th>
                  <th className="pb-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Produzido (cozinha)</td>
                  <td>{fila.quantidades.produzido}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <td>Encaixotado</td>
                  <td>{fila.quantidades.encaixotado}</td>
                  <td>{fila.deltas.encaixotado}</td>
                </tr>
                <tr>
                  <td>Recebido (expedição)</td>
                  <td>
                    {fila.quantidades.recebido_expedicao ?? (
                      <span className="text-amber-700">ausente</span>
                    )}
                  </td>
                  <td>{fila.deltas.recebido ?? '—'}</td>
                </tr>
                <tr>
                  <td>Entrada em câmara</td>
                  <td>
                    {fila.quantidades.entrada_camara ?? (
                      <span className="text-amber-700">ausente</span>
                    )}
                  </td>
                  <td>{fila.deltas.camara ?? '—'}</td>
                </tr>
              </tbody>
            </table>
            {fila.pendencias.length > 0 && (
              <div
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                role="alert"
              >
                <p className="font-medium">Pendências (nada é preenchido por padrão):</p>
                <ul className="mt-1 list-disc list-inside">
                  {fila.pendencias.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {fila.estado === 'revisavel' && (
              <p className="text-xs text-muted-foreground">
                Igualdade exata nas duas etapas — liberada para revisão local do PCP. O envio ao
                Omie é outra etapa da fase, com gate próprio.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Revisão do PCP (demonstração — oráculo T4)</span>
            {aprovacao ? (
              <Badge
                variant="outline"
                className={
                  aprovacao.estado === 'ativa'
                    ? 'border-green-300 text-green-900'
                    : 'border-amber-300 text-amber-900'
                }
              >
                Aprovação {aprovacao.estado}
              </Badge>
            ) : (
              <Badge variant="outline">Sem aprovação</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p className="text-muted-foreground">
            Decidir a quantidade final com motivo registra hashes (eventos + conferências).
            Igualdade 0=0 registra pendência e NÃO libera transação no Omie. Nova conferência
            invalida a aprovação anterior atomicamente.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground">Quantidade final (UN)</span>
              <Input
                type="number"
                min={0}
                value={qtdFinal}
                onChange={(e) => setQtdFinal(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Motivo da decisão</span>
              <Input
                value={motivoAprov}
                onChange={(e) => setMotivoAprov(e.target.value)}
                placeholder="Ex.: divergência revisada — final 96 UN"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={aprovar}
              disabled={
                fila.quantidades.recebido_expedicao === null ||
                fila.quantidades.entrada_camara === null
              }
              title={
                fila.quantidades.recebido_expedicao === null ||
                fila.quantidades.entrada_camara === null
                  ? 'Registre as conferências de expedição e câmara antes de aprovar'
                  : 'Registra a decisão do PCP com motivo e hashes'
              }
            >
              Aprovar consolidação
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={invalidar}
              disabled={!aprovacao || aprovacao.estado !== 'ativa'}
            >
              Simular nova conferência (invalida)
            </Button>
          </div>
          {fila.estado !== 'revisavel' &&
            fila.quantidades.recebido_expedicao !== null &&
            fila.quantidades.entrada_camara !== null && (
              <p className="text-xs text-amber-700" role="note">
                Fila com divergência: a aprovação registra a DECISÃO do PCP (motivo + quantidade
                final). O envio ao Omie continua bloqueado até a fila ficar revisável — gate da
                SPEC-2-005.
              </p>
            )}
          {msgAprov && (
            <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
              {msgAprov}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Conferências registradas ({registros.length})</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {registros.length === 0 && (
            <p className="text-muted-foreground">Nenhuma conferência ainda.</p>
          )}
          {registros.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Etapa</th>
                  <th className="pb-2">Qtd</th>
                  <th className="pb-2">Local</th>
                  <th className="pb-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.conferencia_id}>
                    <td className="py-1 font-mono text-xs">{r.conferencia_id.slice(0, 14)}…</td>
                    <td>{r.etapa === 'recebimento_expedicao' ? 'expedição' : 'câmara'}</td>
                    <td>
                      {r.quantidade} {r.unidade}
                    </td>
                    <td>{r.local}</td>
                    <td className="text-xs text-muted-foreground">{r.motivo ?? '—'}</td>
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

export default Conferencias
