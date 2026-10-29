import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  configurarLoop,
  obterLoop,
  registrarVeredito,
  type RespostaLoop,
} from '@/services/pcp-loop'

const campo = 'border rounded px-2 py-1 text-sm bg-background'
const proporcao = (p: number | null, na: boolean) =>
  na ? 'não aplicável' : p === null ? 'pendente' : `${p.toLocaleString('pt-BR')}%`

const LoopAlertas = () => {
  const [d, setD] = useState<RespostaLoop | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [base, setBase] = useState('')
  const [alvo, setAlvo] = useState('')
  const [janela, setJanela] = useState('')
  const [valid, setValid] = useState('')
  const [texto, setTexto] = useState('')

  const carregar = useCallback(() => {
    obterLoop()
      .then((r) => {
        setD(r)
        setBase(r.config.baseline_pct === null ? '' : String(r.config.baseline_pct))
        setAlvo(r.config.alvo_pct === null ? '' : String(r.config.alvo_pct))
        setJanela(r.config.janela_dias === null ? '' : String(r.config.janela_dias))
        setValid(r.config.validador ?? '')
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? 'Sua conta não tem acesso a esta tela.'
            : 'Não foi possível carregar agora.',
        ),
      )
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  const salvar = (ligar?: boolean) => {
    setMsg(null)
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    configurarLoop({
      baseline_pct: n(base),
      alvo_pct: n(alvo),
      janela_dias: n(janela),
      validador: valid.trim() || null,
      ...(ligar === undefined ? {} : { ligar }),
    })
      .then((r) => {
        setMsg(r.ativo ? 'Loop ligado.' : 'Configuração salva; o loop continua desligado.')
        carregar()
      })
      .catch((e: any) =>
        setMsg(
          e?.status === 403
            ? 'Sua conta não tem a ação editar parâmetros.'
            : e?.response?.faltam
              ? `Não dá para ligar: falta ${e.response.faltam.join(', ')}. O loop continua desligado.`
              : e?.response?.motivos?.join(' ') || 'Não foi possível salvar agora.',
        ),
      )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">LOOP-01 — alertas críticos tratados</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Proporção do ciclo = alertas críticos tratados <strong>com ação registrada</strong> ÷
        alertas críticos gerados no ciclo. Sem alerta crítico no ciclo, o resultado é "não
        aplicável", nunca 100%. O loop só mede, lembra e registra o veredito do validador: não trata
        alerta, não compra e não reprograma.{' '}
        <Link to="/alertas" className="underline">
          Ver os alertas
        </Link>
      </p>
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {d && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                Ciclo atual ({d.atual.ciclo_inicio} a {d.atual.ciclo_fim})
                {d.atual.provisorio && (
                  <Badge variant="outline">provisório: janela ainda não definida</Badge>
                )}
                {d.config.ativo ? (
                  <Badge>loop ligado</Badge>
                ) : (
                  <Badge variant="outline">loop desligado</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                Críticos gerados: <strong>{d.atual.gerados}</strong> · tratados com ação:{' '}
                <strong>{d.atual.tratados}</strong> · proporção:{' '}
                <strong>{proporcao(d.atual.proporcao_pct, d.atual.nao_aplicavel)}</strong>
                {d.config.alvo_pct !== null && <span> · alvo: {d.config.alvo_pct}%</span>}
              </div>
              {!d.config.ativo && (
                <div className="text-xs text-amber-800">
                  Para ligar o loop falta:{' '}
                  {d.faltam_para_ligar.length
                    ? d.faltam_para_ligar.join(', ')
                    : 'ligar com o botão abaixo'}
                  .
                </div>
              )}
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
                <Button size="sm" variant="outline" onClick={() => salvar()}>
                  Salvar
                </Button>
                <Button size="sm" onClick={() => salvar(true)}>
                  Ligar o loop
                </Button>
                {d.config.ativo && (
                  <Button size="sm" variant="outline" onClick={() => salvar(false)}>
                    Desligar
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          {msg && (
            <p className="text-sm" role="status">
              {msg}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ciclos com veredito</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {d.medicoes.length === 0 && <div>Nenhum ciclo com veredito ainda.</div>}
              {d.medicoes.map((m) => (
                <div key={m.ciclo_inicio}>
                  {m.ciclo_inicio} a {m.ciclo_fim}: {m.tratados} de {m.gerados} críticos tratados
                  com ação ({proporcao(m.proporcao_pct, m.nao_aplicavel)}) — veredito{' '}
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
                    id="ciclo-ini"
                  />
                  <input
                    aria-label="Observação do validador"
                    className={`${campo} w-64`}
                    placeholder="observação (opcional)"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  {(['atingido', 'nao_atingido'] as const).map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const ini = (document.getElementById('ciclo-ini') as HTMLInputElement)
                          ?.value
                        registrarVeredito({ ciclo_inicio: ini, veredito: v, texto })
                          .then(() => {
                            setMsg('Veredito registrado; a medição do ciclo ficou congelada.')
                            carregar()
                          })
                          .catch((e: any) =>
                            setMsg(
                              e?.status === 409
                                ? e.response?.motivo ||
                                    'Não dá para registrar o veredito deste ciclo agora.'
                                : e?.status === 403
                                  ? 'Só o validador indicado pode registrar o veredito.'
                                  : e?.response?.motivos?.join(' ') ||
                                    'Não foi possível registrar agora.',
                            ),
                          )
                      }}
                    >
                      {v === 'atingido' ? 'Meta atingida' : 'Meta não atingida'}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{d.aviso}</p>
        </div>
      )}
    </div>
  )
}

export default LoopAlertas
