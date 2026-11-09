import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  assinaturaDoFormulario,
  mensagemDoApontamento,
  novoEventoId,
  resumoDaOrdem,
  validarFormulario,
  type EventoLido,
  type TipoApontamento,
} from '@/lib/pcp/apontamento-servidor'
import { obterPerfil } from '@/services/pcp-access'
import ComoFunciona from '@/components/ComoFunciona'
import { textoSeguro } from '@/lib/pcp/textos'
import {
  lerEstadoProducao,
  registrarApontamentoServidor,
  type EstadoProducao,
} from '@/services/pcp-producao'

// Apontamentos: a cozinha e o encaixotamento gravam no servidor (SPEC-4-001). O identificador do evento
// nasce aqui e é reaproveitado no reenvio da mesma tentativa, para o servidor reconhecer a repetição.
// A tela relê o estado a cada 30 segundos e quando volta a ter foco.
const TIPOS: { tipo: TipoApontamento; rotulo: string }[] = [
  { tipo: 'retirada', rotulo: 'Retirada' },
  { tipo: 'adicional', rotulo: 'Adicional' },
  { tipo: 'devolucao', rotulo: 'Devolução' },
  { tipo: 'perda', rotulo: 'Perda declarada' },
  { tipo: 'realizado', rotulo: 'Realizado' },
]

const Apontamentos = () => {
  const [estado, setEstado] = useState<EstadoProducao | null>(null)
  const [pontos, setPontos] = useState<string[]>([])
  const [erroCarga, setErroCarga] = useState(false)
  const [opId, setOpId] = useState('')
  const [ponto, setPonto] = useState('')
  const [tipo, setTipo] = useState<TipoApontamento>('retirada')
  const [item, setItem] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('KG')
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const tentativa = useRef<{ id: string; assinatura: string } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([lerEstadoProducao(), obterPerfil()])
      setEstado(e)
      setPontos(p.perfil?.pontos ?? [])
      setErroCarga(e === null)
    } catch {
      setErroCarga(true)
    }
  }, [])

  useEffect(() => {
    carregar()
    const timer = window.setInterval(carregar, 30000)
    const aoFocar = () => carregar()
    window.addEventListener('focus', aoFocar)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', aoFocar)
    }
  }, [carregar])

  const ordens = estado?.programacao?.ops ?? []
  const pontoAtual = ponto || pontos[0] || ''
  const opAtual = opId || ordens[0]?.op_id || ''
  const ordemAtual = ordens.find((o) => o.op_id === opAtual) ?? null
  const eventos = useMemo<EventoLido[]>(
    () => (estado?.eventos ?? []).filter((e) => e.op_id === opAtual) as EventoLido[],
    [estado, opAtual],
  )
  const resumo = useMemo(() => resumoDaOrdem(eventos, opAtual), [eventos, opAtual])
  const retificados = useMemo(
    () => new Set(eventos.filter((e) => e.retifica).map((e) => e.retifica as string)),
    [eventos],
  )

  const enviar = async (corpo: Parameters<typeof registrarApontamentoServidor>[0]) => {
    setEnviando(true)
    const r = await registrarApontamentoServidor(corpo)
    const m = mensagemDoApontamento(r.http, r.corpo)
    setResultado(textoSeguro(m.texto, 'Não foi possível registrar. Tente de novo.'))
    if (!m.manterId) tentativa.current = null
    if (m.recarregar) await carregar()
    setEnviando(false)
    return m
  }

  const registrar = async () => {
    const q = Number(quantidade)
    const itemFinal = tipo === 'realizado' ? (ordemAtual?.produto ?? item) : item
    const unidadeFinal = tipo === 'realizado' ? 'UN' : unidade
    const f = { tipo, item: itemFinal, quantidade: q, unidade: unidadeFinal, motivo }
    if (!opAtual || !pontoAtual) {
      setResultado('Escolha a ordem e o ponto.')
      return
    }
    const v = validarFormulario(f)
    if (!v.ok) {
      setResultado(textoSeguro(v.motivo, 'Confira os campos destacados.'))
      return
    }
    const assinatura = assinaturaDoFormulario(opAtual, pontoAtual, f)
    if (!tentativa.current || tentativa.current.assinatura !== assinatura)
      tentativa.current = { id: novoEventoId(), assinatura }
    const m = await enviar({
      evento_id: tentativa.current.id,
      op_id: opAtual,
      ponto: pontoAtual,
      tipo,
      item: itemFinal.trim(),
      quantidade: q,
      unidade: unidadeFinal.trim(),
      motivo: motivo.trim() || undefined,
    })
    if (m.ok) {
      setQuantidade('')
      setMotivo('')
    }
  }

  const retificar = async (e: EventoLido) => {
    const nova = window.prompt('Nova quantidade (o motivo será pedido a seguir):')
    if (nova === null) return
    const q = Number(nova)
    const m = window.prompt('Motivo da retificação (obrigatório):')
    if (!m || !m.trim()) {
      setResultado('Retificação exige motivo.')
      return
    }
    if (!Number.isFinite(q) || q < 0) {
      setResultado('Informe uma quantidade válida.')
      return
    }
    await enviar({
      evento_id: novoEventoId(),
      op_id: e.op_id,
      ponto: e.ponto,
      tipo: e.tipo,
      item: e.item,
      quantidade: q,
      unidade: e.unidade,
      motivo: m.trim(),
      retifica: e.evento_id,
    })
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Apontamentos na origem</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Registre retirada, adicional, devolução, perda declarada e realizado de cada ordem.
      </p>
      <ComoFunciona>
        <p>
          Cada registro guarda autor, ordem, unidade e ponto. Os registros ficam no servidor e não
          são apagados: para corrigir, faça uma retificação com motivo.
        </p>
      </ComoFunciona>

      {erroCarga && (
        <div
          className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          Não foi possível carregar.{' '}
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!erroCarga && estado && ordens.length === 0 && (
        <div
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Ainda não há programação publicada. O PCP publica em Planejamento.
        </div>
      )}

      {ordens.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrar evento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-muted-foreground">Ordem</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={opAtual}
                    onChange={(e) => setOpId(e.target.value)}
                  >
                    {ordens.map((o) => (
                      <option key={o.op_id} value={o.op_id}>
                        {o.op_id} · {o.produto} · {o.data}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Ponto</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={pontoAtual}
                    onChange={(e) => setPonto(e.target.value)}
                  >
                    {pontos.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
              {tipo !== 'realizado' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-muted-foreground">Item</span>
                    <Input value={item} onChange={(e) => setItem(e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-muted-foreground">Unidade</span>
                    <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} />
                  </label>
                </div>
              )}
              <label className="block space-y-1">
                <span className="text-muted-foreground">
                  Quantidade ({tipo === 'realizado' ? 'UN' : unidade})
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
                  <span className="text-muted-foreground">
                    Motivo (obrigatório para realizado 0)
                  </span>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: linha parada por manutenção"
                  />
                </label>
              )}
              <Button size="sm" onClick={registrar} disabled={enviando || pontos.length === 0}>
                Registrar
              </Button>
              {pontos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sua conta não tem ponto de apontamento.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo da ordem {opAtual}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {Object.keys(resumo.realizado).length > 0 && (
                <p>
                  Realizado:{' '}
                  {Object.entries(resumo.realizado).map(([p, q]) => (
                    <Badge key={p} variant="outline" className="mr-1">
                      {p} {q}
                    </Badge>
                  ))}
                </p>
              )}
              {resumo.itens.length === 0 && Object.keys(resumo.realizado).length === 0 && (
                <p className="text-muted-foreground">Nenhum evento registrado nessa ordem.</p>
              )}
              {resumo.itens.map((c) => (
                <div key={`${c.item}|${c.unidade}`} className="rounded-md border px-3 py-2">
                  <strong>
                    {c.item} <span className="font-mono text-xs">({c.unidade})</span>
                  </strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    Líquido {c.liquido.toFixed(2)} = retiradas {c.retiradas.toFixed(2)} + adicionais{' '}
                    {c.adicionais.toFixed(2)} − devoluções {c.devolucoes.toFixed(2)}
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
      )}

      {resultado && (
        <div className="mt-4 rounded-md border px-3 py-2 text-xs bg-muted" role="status">
          {resultado}
        </div>
      )}

      {ordens.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Eventos da ordem ({eventos.length}) — imutáveis
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {eventos.length === 0 && (
              <p className="text-muted-foreground">Nenhum evento registrado.</p>
            )}
            {eventos.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2">Tipo</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Qtd</th>
                    <th className="pb-2">Ponto</th>
                    <th className="pb-2">Autor</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr
                      key={e.evento_id}
                      className={retificados.has(e.evento_id) ? 'opacity-60' : ''}
                    >
                      <td>
                        {e.tipo}
                        {e.retifica && (
                          <span className="ml-1 text-xs text-muted-foreground">(retificação)</span>
                        )}
                        {retificados.has(e.evento_id) && (
                          <span className="ml-1 text-xs text-muted-foreground">(retificado)</span>
                        )}
                      </td>
                      <td>{e.item}</td>
                      <td>
                        {e.quantidade} {e.unidade}
                      </td>
                      <td>{e.ponto}</td>
                      <td className="text-xs">{e.autor}</td>
                      <td>
                        {!retificados.has(e.evento_id) && pontos.includes(e.ponto) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={enviando}
                            onClick={() => retificar(e)}
                          >
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
      )}
    </div>
  )
}

export default Apontamentos
