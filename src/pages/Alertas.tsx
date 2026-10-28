import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  obterAlertas,
  rodarAlertas,
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

const Alertas = () => {
  const [dados, setDados] = useState<RespostaAlertas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [rodada, setRodada] = useState<ResultadoRodada | null>(null)
  const [rodando, setRodando] = useState(false)

  const carregar = useCallback(() => {
    obterAlertas()
      .then(setDados)
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? 'Sua conta não tem acesso a esta tela.'
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

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Alertas</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Cada alerta mostra a regra e os números usados. Alerta só informa: não compra, não publica
        ordem, não muda parâmetro e não gera ação financeira. A mesma situação atualiza o alerta
        aberto em vez de criar outro.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/parametros/alertas" className="underline text-sm">
          Parâmetros de alerta
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
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {rodada && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm" role="status">
          {rodada.executou
            ? `Rodada feita: ${rodada.criados} novos, ${rodada.atualizados} atualizados, ${rodada.lacunas} lacunas.`
            : rodada.motivo}
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
            {rodada.fontes_pendentes.map((f) => (
              <li key={f}>sem fonte ligada — {f}</li>
            ))}
          </ul>
        </div>
      )}
      {!erro && !dados && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {dados && dados.alertas.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">Nenhum alerta aberto.</CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {dados?.alertas.map((a) => (
          <Card key={a.chave}>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <Badge variant="outline">{TIPO[a.tipo] ?? a.tipo}</Badge>
                <span className="font-mono">{a.item}</span>
                {a.gravidade === 'critico' ? (
                  <Badge className="bg-red-100 text-red-900 border-red-300">crítico</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300">atenção</Badge>
                )}
                {a.fonte_desatualizada && <Badge variant="outline">dado desatualizado</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
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
                <span className="font-mono">{l.item}</span> — {l.motivo}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Alertas
