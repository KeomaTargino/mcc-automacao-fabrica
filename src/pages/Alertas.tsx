import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import {
  ACOES_TRATAMENTO,
  assumirAlerta,
  mudarRegraAlerta,
  obterAlertas,
  obterHistoricoAlerta,
  rodarAlertas,
  tratarAlerta,
  type AlertaAberto,
  type EventoAlerta,
  type RespostaAlertas,
  type ResultadoRodada,
} from '@/services/pcp-alertas'

const TIPO: Record<string, string> = {
  estoque: 'Estoque',
  producao: 'Produção',
  compra: 'Compra',
  preco: 'Preço',
  pedido: 'Pedido',
  divergencia: 'Divergência',
}

const ESTADO: Record<string, string> = {
  aberto: 'aberto',
  em_analise: 'em análise',
  tratado: 'tratado',
}

const NUMERO: Record<string, string> = {
  saldo: 'saldo',
  aReceberNoPrazo: 'a receber no prazo',
  consumoDia: 'consumo por dia',
  minimo: 'mínimo',
  prazoDias: 'prazo do fornecedor (dias)',
  projetado: 'saldo projetado',
  diasAteMinimo: 'dias até o mínimo',
  diaProgramado: 'dia programado',
  diasDeAtraso: 'dias de atraso',
  dataPrevista: 'data prevista',
  atrasoAceitoDias: 'atraso aceito (dias)',
  restante: 'restante a receber',
  aprovadaEm: 'aprovada em',
  diasSemPedido: 'dias sem pedido',
  preco: 'preço',
  ultimoPreco: 'último preço',
  diferencaPct: 'diferença (%)',
  toleranciaPct: 'tolerância (%)',
  desde: 'desde',
  horasParado: 'horas parado',
  tempoMaxHoras: 'tempo máximo (horas)',
  diferenca: 'diferença',
}

const EVENTO: Record<string, string> = {
  assumido: 'assumiu o alerta',
  tratado: 'tratou o alerta',
  regra_desligada: 'desligou a regra',
  regra_ligada: 'ligou a regra',
}

const msgErro = (e: any) =>
  e?.status === 403 || e?.status === 409
    ? mensagemDeErro(e)
    : textoSeguro(e?.response?.motivos?.join(' '), 'Não foi possível concluir agora.')

const Cartao = ({
  a,
  recarregar,
  aviso,
}: {
  a: AlertaAberto
  recarregar: () => void
  aviso: (m: string) => void
}) => {
  const [acao, setAcao] = useState('')
  const [texto, setTexto] = useState('')
  const [historico, setHistorico] = useState<EventoAlerta[] | null>(null)
  const rodar = (f: () => Promise<any>) =>
    f()
      .then(() => recarregar())
      .catch((e) => {
        aviso(msgErro(e))
        recarregar()
      })
  return (
    <div className="rounded-md border p-3 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{ESTADO[a.estado] ?? rotuloEstado(a.estado)}</Badge>
        {a.gravidade === 'critico' ? (
          <Badge className="bg-red-100 text-red-900 border-red-300">crítico</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-900 border-amber-300">atenção</Badge>
        )}
        {a.fonte_desatualizada && <Badge variant="outline">dado desatualizado</Badge>}
        {a.anterior_id && <Badge variant="outline">volta de um alerta já tratado</Badge>}
        {a.responsavel && a.estado === 'em_analise' && (
          <span className="text-xs">em análise com {a.responsavel}</span>
        )}
      </div>
      <div>{a.regra}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {Object.entries(a.valores).map(([k, v]) => (
          <span key={k}>
            {NUMERO[k] ?? k}: <strong>{String(v)}</strong>
          </span>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Dado de {new Date(a.dado_em).toLocaleString('pt-BR')} · aberto em{' '}
        {new Date(a.aberto_em).toLocaleString('pt-BR')} · atualizado {a.atualizacoes}{' '}
        {a.atualizacoes === 1 ? 'vez' : 'vezes'} · parâmetros v{a.versao_parametros}
      </div>
      {a.estado === 'tratado' && (
        <div className="text-xs">
          Tratado por {a.tratado_por} em{' '}
          {a.tratado_em ? new Date(a.tratado_em).toLocaleString('pt-BR') : ''}:{' '}
          {a.acao?.replace(/_/g, ' ')}
          {a.acao_texto ? ` — ${a.acao_texto}` : ''}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {a.estado === 'aberto' && a.pode_tratar && (
          <Button
            size="sm"
            onClick={() => rodar(() => assumirAlerta({ id: a.id, versao_esperada: a.versao }))}
          >
            Assumir
          </Button>
        )}
        {a.estado === 'em_analise' && a.pode_tratar && (
          <>
            <select
              aria-label="Ação tomada"
              className="border rounded px-2 py-1 text-sm bg-background"
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
            >
              <option value="">registre a ação tomada</option>
              {ACOES_TRATAMENTO.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <input
              aria-label="Motivo ou descrição"
              className="border rounded px-2 py-1 text-sm w-56 bg-background"
              placeholder="motivo ou descrição"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!acao}
              onClick={() =>
                rodar(() => tratarAlerta({ id: a.id, versao_esperada: a.versao, acao, texto }))
              }
            >
              Registrar tratamento
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            historico
              ? setHistorico(null)
              : obterHistoricoAlerta(a.id)
                  .then((r) => setHistorico(r.eventos))
                  .catch((e) => aviso(msgErro(e)))
          }
        >
          {historico ? 'Ocultar histórico' : 'Histórico'}
        </Button>
      </div>
      {historico && (
        <ul className="text-xs list-disc pl-5">
          {historico.length === 0 && <li>Sem registros ainda.</li>}
          {historico.map((h, i) => (
            <li key={i}>
              {new Date(h.em).toLocaleString('pt-BR')} — {h.autor} {EVENTO[h.evento] ?? h.evento}
              {h.detalhe ? `: ${h.detalhe.replace(/_/g, ' ')}` : ''} (ocorrência {h.ocorrencia})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const Alertas = () => {
  const [dados, setDados] = useState<RespostaAlertas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [rodada, setRodada] = useState<ResultadoRodada | null>(null)
  const [rodando, setRodando] = useState(false)

  const carregar = useCallback(() => {
    obterAlertas()
      .then(setDados)
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar os alertas agora. Tente de novo em instantes.',
        ),
      )
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  const rodar = () => {
    setRodando(true)
    rodarAlertas()
      .then((r) => {
        setRodada(r)
        carregar()
      })
      .catch(() => setErro('Não foi possível rodar os alertas agora.'))
      .finally(() => setRodando(false))
  }

  // agrupados por tipo e item
  const grupos = new Map<string, { tipo: string; item: string; alertas: AlertaAberto[] }>()
  for (const a of dados?.alertas ?? []) {
    const k = `${a.tipo}|${a.item}`
    const g = grupos.get(k) ?? { tipo: a.tipo, item: a.item, alertas: [] }
    g.alertas.push(a)
    grupos.set(k, g)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Alertas</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Os alertas da sua área: assuma para analisar e registre a ação tomada.
      </p>
      <ComoFunciona>
        <p>
          O sistema só registra: não compra, não reprograma, não publica ordem, não muda parâmetro e
          não gera ação financeira.
        </p>
        <p>
          A mesma situação atualiza o alerta aberto. Se ela voltar depois de tratada, nasce um
          alerta novo ligado ao anterior.
        </p>
      </ComoFunciona>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/parametros/alertas" className="underline text-sm">
          Parâmetros de alerta
        </Link>
        <Link to="/alertas/loop" className="underline text-sm">
          Alertas críticos tratados
        </Link>
        {dados?.pode_rodar && (
          <Button size="sm" onClick={rodar} disabled={rodando}>
            {rodando ? 'Rodando…' : 'Rodar os alertas agora'}
          </Button>
        )}
        {dados?.ultima_rodada && (
          <span className="text-xs text-muted-foreground">
            Última atualização: {new Date(dados.ultima_rodada).toLocaleString('pt-BR')}
          </span>
        )}
      </div>
      {dados?.pode_mudar_regra && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {Object.entries(TIPO).map(([t, r]) => {
            const desligada = dados.regras_desligadas.includes(t)
            return (
              <Button
                key={t}
                size="sm"
                variant="outline"
                onClick={() =>
                  mudarRegraAlerta({ tipo: t, ativa: desligada })
                    .then(carregar)
                    .catch((e) => setAviso(msgErro(e)))
                }
              >
                {r}: {desligada ? 'desligada — ligar' : 'ligada — desligar'}
              </Button>
            )
          })}
        </div>
      )}
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {aviso && (
        <div
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {aviso}
        </div>
      )}
      {rodada && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm" role="status">
          {rodada.executou
            ? `Rodada feita: ${rodada.criados} novos, ${rodada.atualizados} atualizados, ${rodada.lacunas} lacunas.`
            : textoSeguro(rodada.motivo, 'Os alertas não rodaram agora.')}
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
            {rodada.fontes_pendentes.map((f) => (
              <li key={f}>sem fonte ligada — {textoSeguro(f, 'uma fonte de dados')}</li>
            ))}
          </ul>
        </div>
      )}
      {!erro && !dados && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {dados && dados.alertas.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">Nenhum alerta da sua área.</CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {[...grupos.values()].map((g) => (
          <Card key={`${g.tipo}|${g.item}`}>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TIPO[g.tipo] ?? g.tipo}</Badge>
                <span className="font-mono">{g.item}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {g.alertas.length} {g.alertas.length === 1 ? 'alerta' : 'alertas'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.alertas.map((a) => (
                <Cartao key={`${a.id}-${a.versao}`} a={a} recarregar={carregar} aviso={setAviso} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {dados && dados.lacunas.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Lacunas: alertas que não foram calculados</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {dados.lacunas.map((l) => (
              <div key={`${l.regra}|${l.item}|${l.campo}`}>
                <span className="font-mono">{l.item}</span> —{' '}
                {textoSeguro(l.motivo, 'sem informação')}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Alertas
