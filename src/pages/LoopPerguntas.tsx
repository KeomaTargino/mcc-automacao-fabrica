import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  acaoLoop2,
  obterLoop2,
  type PerguntaPrioritaria,
  type RespostaLoop2,
  type RespostaLoop2Somente,
} from '@/services/pcp-loop2'

const campo = 'border rounded px-2 py-1 text-sm bg-background'
const proporcao = (p: number | null, na: boolean) =>
  na ? 'não aplicável' : p === null ? 'pendente' : `${p.toLocaleString('pt-BR')}%`

const Ligar = ({
  prioritarias,
  onLigar,
}: {
  prioritarias: PerguntaPrioritaria[]
  onLigar: (codigo: string) => void
}) => {
  const [cod, setCod] = useState('')
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Pergunta prioritária"
        className={campo}
        value={cod}
        onChange={(e) => setCod(e.target.value)}
      >
        <option value="">ligar a uma prioritária…</option>
        {prioritarias
          .filter((p) => p.ativa)
          .map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.codigo} — {p.texto}
            </option>
          ))}
      </select>
      <Button size="sm" variant="outline" disabled={!cod} onClick={() => onLigar(cod)}>
        Ligar
      </Button>
    </span>
  )
}

const LoopPerguntas = () => {
  const { isAuthenticated, loading } = useAuth()
  const [d, setD] = useState<RespostaLoop2 | RespostaLoop2Somente | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [cod, setCod] = useState('')
  const [texto, setTexto] = useState('')
  const [area, setArea] = useState('pcp')
  const [base, setBase] = useState('')
  const [alvo, setAlvo] = useState('')
  const [janela, setJanela] = useState('')
  const [valid, setValid] = useState('')
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(() => {
    obterLoop2()
      .then((r) => {
        setD(r)
        if (!r.somente_minhas) {
          setBase(r.config.baseline_pct === null ? '' : String(r.config.baseline_pct))
          setAlvo(r.config.alvo_pct === null ? '' : String(r.config.alvo_pct))
          setJanela(r.config.janela_dias === null ? '' : String(r.config.janela_dias))
          setValid(r.config.validador ?? '')
        }
      })
      .catch((e: any) =>
        setErro(e?.status === 403 ? mensagemDeErro(e) : 'Não foi possível carregar agora.'),
      )
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  if (!loading && !isAuthenticated) return <Navigate to="/login" replace />

  const rodar = (corpo: Record<string, unknown>, ok: string) =>
    acaoLoop2(corpo)
      .then(() => {
        setMsg(ok)
        carregar()
      })
      .catch((e: any) =>
        setMsg(
          e?.status === 403
            ? mensagemDeErro(e)
            : e?.response?.faltam
              ? `Não dá para ligar: falta ${e.response.faltam.map((f: string) => textoSeguro(f, 'uma condição')).join(', ')}. O acompanhamento continua desligado.`
              : textoSeguro(
                  e?.response?.motivos?.join(' ') || e?.response?.motivo,
                  'Não foi possível concluir agora.',
                ),
        ),
      )

  const n = (v: string) => (v.trim() === '' ? null : Number(v))

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Perguntas respondidas com fonte</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Quantas perguntas prioritárias o assistente respondeu com fonte e período.{' '}
        <Link to="/assistente" className="underline">
          Voltar ao assistente
        </Link>
      </p>
      <ComoFunciona>
        <p>
          Proporção do ciclo = perguntas prioritárias respondidas com fonte e período{' '}
          <strong>e aceitas pelo validador</strong> ÷ perguntas prioritárias feitas no ciclo. Sem
          pergunta prioritária no ciclo, “não aplicável”, nunca 100%.
        </p>
        <p>
          A pergunta feita é ligada à prioritária por escolha de quem perguntou ou do validador. O
          acompanhamento só mede e registra o veredito; não responde no lugar do assistente.
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
      {msg && (
        <p className="text-sm mb-3" role="status">
          {msg}
        </p>
      )}
      {d?.somente_minhas && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Minhas perguntas recentes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {d.minhas.length === 0 && <div>Você ainda não fez perguntas ao assistente.</div>}
            {d.minhas.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <span>{p.pergunta}</span>
                <Badge variant="outline">{p.tem_fonte ? 'com fonte' : 'sem fonte'}</Badge>
                <Ligar
                  prioritarias={d.prioritarias}
                  onLigar={(c) =>
                    rodar(
                      { acao: 'ligar', pergunta_id: p.id, codigo: c },
                      'Pergunta ligada à prioritária.',
                    )
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {d && !d.somente_minhas && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                Ciclo atual ({d.atual.ciclo_inicio} a {d.atual.ciclo_fim})
                {d.atual.provisorio && (
                  <Badge variant="outline">provisório: janela ainda não definida</Badge>
                )}
                {d.config.ativo ? (
                  <Badge>acompanhamento ligado</Badge>
                ) : (
                  <Badge variant="outline">acompanhamento desligado</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                Prioritárias feitas: <strong>{d.atual.gerados}</strong> · aceitas com fonte e
                período: <strong>{d.atual.tratados}</strong> · proporção:{' '}
                <strong>{proporcao(d.atual.proporcao_pct, d.atual.nao_aplicavel)}</strong>
                {d.config.alvo_pct !== null && <span> · alvo: {d.config.alvo_pct}%</span>}
              </div>
              {!d.config.ativo && (
                <div className="text-xs text-amber-800">
                  Para ligar falta:{' '}
                  {d.faltam_para_ligar.length
                    ? d.faltam_para_ligar.map((f) => textoSeguro(f, 'uma condição')).join(', ')
                    : 'usar o botão Ligar'}
                  .
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perguntas prioritárias</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {d.prioritarias.length === 0 && <div>Nenhuma pergunta prioritária cadastrada.</div>}
              {d.prioritarias.map((p) => (
                <div key={p.codigo}>
                  <span className="font-mono">{p.codigo}</span> ({p.area}, v{p.versao}) {p.texto}{' '}
                  {!p.ativa && <Badge variant="outline">inativa</Badge>}
                </div>
              ))}
              {d.pode_cadastrar && (
                <div className="flex flex-wrap items-end gap-2 pt-2">
                  <input
                    className={`${campo} w-24`}
                    placeholder="código"
                    value={cod}
                    onChange={(e) => setCod(e.target.value)}
                  />
                  <input
                    className={`${campo} w-72`}
                    placeholder="a pergunta"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <select className={campo} value={area} onChange={(e) => setArea(e.target.value)}>
                    <option value="pcp">PCP</option>
                    <option value="compras">Compras</option>
                    <option value="faturamento">Faturamento</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      rodar(
                        { acao: 'prioritaria', codigo: cod, texto, area },
                        'Pergunta prioritária salva.',
                      )
                    }
                  >
                    Salvar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perguntas do ciclo</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {d.perguntas.length === 0 && <div>Nenhuma pergunta ao assistente neste ciclo.</div>}
              {d.perguntas.map((p) => (
                <div key={p.id} className="border-b pb-2 space-y-1">
                  <div>
                    {p.pergunta}{' '}
                    <span className="text-xs text-muted-foreground">({p.usuario})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{p.resultado.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline">
                      {p.tem_fonte ? 'com fonte e período' : 'sem fonte ou período'}
                    </Badge>
                    {p.revisao ? (
                      <span>ligada a {p.revisao.prioritaria}</span>
                    ) : (
                      <Ligar
                        prioritarias={d.prioritarias}
                        onLigar={(c) =>
                          rodar(
                            { acao: 'ligar', pergunta_id: p.id, codigo: c },
                            'Pergunta ligada à prioritária.',
                          )
                        }
                      />
                    )}
                    {p.revisao?.decisao && (
                      <span>
                        {p.revisao.decisao === 'aceita'
                          ? 'aceita'
                          : `recusada: ${textoSeguro(p.revisao.motivo, 'sem motivo informado')}`}{' '}
                        por {p.revisao.validador}
                      </span>
                    )}
                  </div>
                  {d.pode_validar && p.revisao && !p.revisao.decisao && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="Motivo da recusa"
                        className={`${campo} w-64`}
                        placeholder="motivo (obrigatório na recusa)"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          rodar(
                            { acao: 'revisar', pergunta_id: p.id, aceita: true },
                            'Resposta aceita.',
                          )
                        }
                      >
                        Aceitar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          rodar(
                            { acao: 'revisar', pergunta_id: p.id, aceita: false, motivo },
                            'Resposta recusada.',
                          )
                        }
                      >
                        Recusar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {d.pode_configurar && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Condições definidas pelo cliente</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3 text-sm">
                <label className="block">
                  Linha de base (%)
                  <input
                    className={`${campo} block w-24`}
                    inputMode="decimal"
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                  />
                </label>
                <label className="block">
                  Alvo (%)
                  <input
                    className={`${campo} block w-24`}
                    inputMode="decimal"
                    value={alvo}
                    onChange={(e) => setAlvo(e.target.value)}
                  />
                </label>
                <label className="block">
                  Janela (dias)
                  <input
                    className={`${campo} block w-24`}
                    inputMode="numeric"
                    value={janela}
                    onChange={(e) => setJanela(e.target.value)}
                  />
                </label>
                <label className="block">
                  E-mail do validador
                  <input
                    className={`${campo} block w-64`}
                    value={valid}
                    onChange={(e) => setValid(e.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    rodar(
                      {
                        acao: 'config',
                        baseline_pct: n(base),
                        alvo_pct: n(alvo),
                        janela_dias: n(janela),
                        validador: valid.trim() || null,
                      },
                      'Configuração salva; o acompanhamento continua desligado se faltar algo.',
                    )
                  }
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    rodar(
                      {
                        acao: 'config',
                        baseline_pct: n(base),
                        alvo_pct: n(alvo),
                        janela_dias: n(janela),
                        validador: valid.trim() || null,
                        ligar: true,
                      },
                      'Acompanhamento ligado.',
                    )
                  }
                >
                  Ligar o acompanhamento
                </Button>
                {d.config.ativo && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      rodar({ acao: 'config', ligar: false }, 'Acompanhamento desligado.')
                    }
                  >
                    Desligar
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ciclos com veredito</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {d.medicoes.length === 0 && <div>Nenhum ciclo com veredito ainda.</div>}
              {d.medicoes.map((m) => (
                <div key={m.ciclo_inicio}>
                  {m.ciclo_inicio} a {m.ciclo_fim}: {m.tratados} de {m.gerados} aceitas (
                  {proporcao(m.proporcao_pct, m.nao_aplicavel)}) — veredito{' '}
                  <strong>{m.veredito === 'atingido' ? 'atingido' : 'não atingido'}</strong> por{' '}
                  {m.veredito_por}
                  {m.veredito_texto ? `: ${m.veredito_texto}` : ''}. Medição congelada.
                </div>
              ))}
              {d.pode_validar && d.config.ativo && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <input
                    aria-label="Início do ciclo"
                    type="date"
                    className={campo}
                    id="ciclo2-ini"
                  />
                  {(['atingido', 'nao_atingido'] as const).map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        rodar(
                          {
                            acao: 'veredito',
                            ciclo_inicio: (
                              document.getElementById('ciclo2-ini') as HTMLInputElement
                            )?.value,
                            veredito: v,
                          },
                          'Veredito registrado; a medição ficou congelada.',
                        )
                      }
                    >
                      {v === 'atingido' ? 'Meta atingida' : 'Meta não atingida'}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{textoSeguro(d.aviso, '')}</p>
        </div>
      )}
    </div>
  )
}

export default LoopPerguntas
