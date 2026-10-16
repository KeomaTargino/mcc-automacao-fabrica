import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  prepararTransacao,
  autorizarPayload,
  enviarComAquisicao,
  reconciliarPorConsulta,
  OP_FILA_DEMO,
  PAYLOAD_DEMO,
  type Transacao,
  type AdapterMock,
} from '@/lib/pcp/fila-omie'

type Cenario = {
  rotulo: string
  descricao: string
  executar: () => { estadoFinal: string; posts: number; pendencias: string[]; passos: string[] }
}

const agora = new Date('2026-10-16T12:00:00Z')

const CENARIOS: Cenario[] = [
  {
    rotulo: 'T1 · Sem aprovação → zero POST',
    descricao: 'Transação preparada sem hash aprovado: o mutante não executa (O1).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-1',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 100,
      })
      const passos = [`preparada (qtd ${p.transacao.quantidade})`]
      let posts = 0
      const adapter: AdapterMock = {
        enviar: () => {
          posts++
          return { respostaChegou: true, efeitoAplicado: true }
        },
      }
      const r = enviarComAquisicao(p.transacao, PAYLOAD_DEMO, adapter, agora, 60000, true)
      passos.push(`envio: ${r.estado === 'negado' ? 'negado' : r.estado}`)
      const t: Transacao = r.estado === 'negado' ? p.transacao : (r as any).transacao
      return { estadoFinal: t.estado, posts, pendencias: t.pendencias, passos }
    },
  },
  {
    rotulo: 'T1b · Payload alterado após aprovação → bloqueada',
    descricao: 'Hash aprovado em 100; payload chega com 99: aprovação invalidada (O2).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-2',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 100,
      })
      const hash = JSON.stringify(PAYLOAD_DEMO)
      const a = autorizarPayload(
        p.transacao,
        { payload_hash: hash, aprovador: 'PCP (demo)' },
        PAYLOAD_DEMO,
      )
      const b = autorizarPayload(
        p.transacao,
        { payload_hash: hash, aprovador: 'PCP (demo)' },
        { ...PAYLOAD_DEMO, quantidade: 99 },
      )
      return {
        estadoFinal: b.estado,
        posts: 0,
        pendencias: b.pendencias,
        passos: [`autorizada com hash`, `revalidação com payload 99: ${b.estado}`],
      }
    },
  },
  {
    rotulo: 'T2 · Dois workers → 1 aquisição, 1 POST',
    descricao: 'Segundo worker sem lease lê o estado e não envia (O3).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-3',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 100,
      })
      const a = autorizarPayload(
        p.transacao,
        { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'PCP (demo)' },
        PAYLOAD_DEMO,
      )
      let posts = 0
      const adapter: AdapterMock = {
        enviar: () => {
          posts++
          return { respostaChegou: true, efeitoAplicado: true }
        },
      }
      const r1 = enviarComAquisicao(a, PAYLOAD_DEMO, adapter, agora, 60000, true)
      const r2 = enviarComAquisicao(a, PAYLOAD_DEMO, adapter, agora, 60000, false)
      const t: Transacao = r1.estado === 'negado' ? a : (r1 as any).transacao
      return {
        estadoFinal: t.estado,
        posts,
        pendencias: t.pendencias,
        passos: [
          `worker 1: ${r1.estado}`,
          `worker 2: ${r2.estado === 'negado' ? 'negado (lease)' : r2.estado}`,
        ],
      }
    },
  },
  {
    rotulo: 'T3 · Resposta perdida → incerto → consulta confirma',
    descricao:
      'Mock aplica o efeito e corta a resposta: incerto; consulta conclusiva confirma sem novo POST (O4).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-4',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 100,
      })
      const a = autorizarPayload(
        p.transacao,
        { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'PCP (demo)' },
        PAYLOAD_DEMO,
      )
      let posts = 0
      const r = enviarComAquisicao(
        a,
        PAYLOAD_DEMO,
        {
          enviar: () => {
            posts++
            return { respostaChegou: false, efeitoAplicado: true }
          },
        },
        agora,
        60000,
        true,
      )
      const rec = reconciliarPorConsulta((r as any).transacao, { encontrou: true, quantidade: 100 })
      return {
        estadoFinal: rec.estado,
        posts,
        pendencias: rec.transacao.pendencias,
        passos: [
          `envio: ${r.estado}`,
          `consulta: encontrou 100 → ${rec.estado} (novo POST? ${rec.novoPostAutorizado ? 'sim' : 'não'})`,
        ],
      }
    },
  },
  {
    rotulo: 'T4 · Consulta inconclusiva → sem retry',
    descricao:
      'Ausência na consulta não prova ausência de efeito: mantém incerto, nunca reenvia (O4).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-5',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 100,
      })
      const a = autorizarPayload(
        p.transacao,
        { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'PCP (demo)' },
        PAYLOAD_DEMO,
      )
      let posts = 0
      const r = enviarComAquisicao(
        a,
        PAYLOAD_DEMO,
        {
          enviar: () => {
            posts++
            return { respostaChegou: false, efeitoAplicado: true }
          },
        },
        agora,
        60000,
        true,
      )
      const rec = reconciliarPorConsulta((r as any).transacao, {
        encontrou: false,
        quantidade: null,
      })
      return {
        estadoFinal: rec.estado,
        posts,
        pendencias: rec.transacao.pendencias,
        passos: [
          `envio: ${r.estado}`,
          `consulta: não encontrou → ${rec.estado} (novo POST? ${rec.novoPostAutorizado ? 'sim' : 'não'})`,
        ],
      }
    },
  },
  {
    rotulo: 'T6 · Quantidade final 0 → bloqueada, zero POST',
    descricao:
      'Resultado 0 é ocorrência para decisão do PCP: mutante negado, histórico preservado (O1/T6).',
    executar: () => {
      const p = prepararTransacao({
        transacao_id: 'TR-6',
        op_id: OP_FILA_DEMO.op_id,
        revisao_consolidacao: 1,
        operacao: 'concluir_op',
        codigo_integracao: OP_FILA_DEMO.codigo_integracao,
        quantidade: 0,
      })
      let posts = 0
      const adapter: AdapterMock = {
        enviar: () => {
          posts++
          return { respostaChegou: true, efeitoAplicado: true }
        },
      }
      const r = enviarComAquisicao(p.transacao, PAYLOAD_DEMO, adapter, agora, 60000, true)
      return {
        estadoFinal: p.transacao.estado,
        posts,
        pendencias: p.transacao.pendencias,
        passos: [
          `preparação: ${p.estado}`,
          `envio: ${r.estado === 'negado' ? 'negado' : r.estado}`,
        ],
      }
    },
  },
]

const Consolidacoes = () => {
  const [aberto, setAberto] = useState<string | null>(null)
  const resultados = useMemo(() => CENARIOS.map((c) => ({ c, r: c.executar() })), [])

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Fila de envio ao Omie (simulação)</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Recorte MOCK: nenhum POST real ao ERP. Estados da transação, lease de trabalhador único e
        recuperação por consulta — as provas antes do primeiro envio real são a próxima task da
        fase.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> Adapter simulado com fixtures isoladas (oráculos
        T1/T2/T3/T4/T6 da SPEC-2-005). O envio real exige contrato da conta, provas de recuperação e
        autorização específica do caso — tasks seguintes.
      </div>

      <div className="space-y-3">
        {resultados.map(({ c, r }) => (
          <Card key={c.rotulo}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{c.rotulo}</span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      r.estadoFinal === 'confirmada'
                        ? 'border-green-300 text-green-900'
                        : r.estadoFinal === 'bloqueada' || r.estadoFinal === 'resultado_incerto'
                          ? 'border-amber-300 text-amber-900'
                          : 'border-slate-300 text-slate-700'
                    }
                  >
                    {r.estadoFinal}
                  </Badge>
                  <Badge variant="outline">POSTs: {r.posts}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">{c.descricao}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAberto(aberto === c.rotulo ? null : c.rotulo)}
              >
                {aberto === c.rotulo ? 'Ocultar passos' : 'Ver passos'}
              </Button>
              {aberto === c.rotulo && (
                <div className="rounded-md border px-3 py-2 text-xs bg-muted space-y-1">
                  <ol className="list-decimal list-inside">
                    {r.passos.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                  {r.pendencias.length > 0 && (
                    <ul className="list-disc list-inside text-amber-800">
                      {r.pendencias.map((p, i) => (
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
    </div>
  )
}

export default Consolidacoes
