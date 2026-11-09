import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  aprovacaoAtiva,
  filaDaOrdem,
  mensagemDaAprovacao,
  mensagemDaConferencia,
  novoId,
  podeAprovar,
  podeConferir,
  type EtapaServidor,
  type EstadoParaFila,
  type PerfilTela,
} from '@/lib/pcp/conferencia-servidor'
import { obterPerfil } from '@/services/pcp-access'
import ComoFunciona from '@/components/ComoFunciona'
import { rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import {
  aprovarConsolidacaoServidor,
  lerEstadoProducao,
  registrarConferenciaServidor,
} from '@/services/pcp-producao'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Escolha from '@/components/Escolha'
import Aviso from '@/components/Aviso'

// Conferências: a expedição e a câmara conferem e o PCP aprova no servidor (SPEC-4-001). Os identificadores
// nascem aqui e são reaproveitados no reenvio da mesma tentativa. A tela relê o estado a cada 30 segundos
// e quando volta a ter foco. Produzido e encaixotado vêm dos apontamentos gravados no servidor.
const Conferencias = () => {
  const [estado, setEstado] = useState<EstadoParaFila | null>(null)
  const [perfil, setPerfil] = useState<PerfilTela | null>(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [opId, setOpId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [resultado, setResultado] = useState('')
  const [qtdFinal, setQtdFinal] = useState('')
  const [motivoAprov, setMotivoAprov] = useState('')
  const [msgAprov, setMsgAprov] = useState('')
  const [enviando, setEnviando] = useState(false)
  const tentativaConf = useRef<{ id: string; assinatura: string } | null>(null)
  const tentativaAprov = useRef<{ id: string; assinatura: string } | null>(null)
  const inputQtd = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([lerEstadoProducao(), obterPerfil()])
      setEstado(e as unknown as EstadoParaFila | null)
      setPerfil((p.perfil as PerfilTela | null) ?? null)
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
  const opAtual = opId || ordens[0]?.op_id || ''
  const fila = useMemo(() => (estado ? filaDaOrdem(estado, opAtual) : null), [estado, opAtual])
  const registros = useMemo(
    () => (estado?.conferencias ?? []).filter((c) => c.op_id === opAtual),
    [estado, opAtual],
  )
  const ativa = estado ? aprovacaoAtiva(estado, opAtual) : null
  const ordemPreparada = estado?.ordens.find((t) => t.op_id === opAtual) ?? null
  const faltaConferencia =
    !fila ||
    fila.quantidades.recebido_expedicao === null ||
    fila.quantidades.entrada_camara === null
  const podeExp = podeConferir(perfil, 'recebimento_expedicao')
  const podeCam = podeConferir(perfil, 'entrada_camara')
  const aprova = podeAprovar(perfil)

  const registrar = async (etapa: EtapaServidor) => {
    const q = Number(quantidade)
    if (quantidade.trim() === '' || !Number.isFinite(q) || q < 0) {
      setResultado(
        'Digite a quantidade conferida antes de registrar (nada é preenchido por padrão).',
      )
      inputQtd.current?.focus()
      return
    }
    if (!opAtual) {
      setResultado('Escolha a ordem.')
      return
    }
    const assinatura = JSON.stringify([opAtual, etapa, q])
    if (!tentativaConf.current || tentativaConf.current.assinatura !== assinatura)
      tentativaConf.current = { id: novoId('CF'), assinatura }
    setEnviando(true)
    const r = await registrarConferenciaServidor({
      registro_id: tentativaConf.current.id,
      op_id: opAtual,
      etapa,
      quantidade: q,
      unidade: 'UN',
    })
    const m = mensagemDaConferencia(r.http, r.corpo)
    setResultado(textoSeguro(m.texto, 'Não foi possível registrar. Tente de novo.'))
    if (!m.manterId) tentativaConf.current = null
    if (m.ok) {
      setQuantidade('') // campo limpo: a próxima conferência é digitada, nunca puxada
      inputQtd.current?.focus()
    }
    if (m.recarregar) await carregar()
    setEnviando(false)
  }

  const aprovar = async () => {
    const q = Number(qtdFinal)
    if (qtdFinal.trim() === '' || !Number.isFinite(q) || q < 0) {
      setMsgAprov('Informe a quantidade final (zero ou mais).')
      return
    }
    if (!motivoAprov.trim()) {
      setMsgAprov('Informe o motivo da decisão.')
      return
    }
    const assinatura = JSON.stringify([opAtual, q, motivoAprov.trim()])
    if (!tentativaAprov.current || tentativaAprov.current.assinatura !== assinatura)
      tentativaAprov.current = { id: novoId('AP'), assinatura }
    setEnviando(true)
    const r = await aprovarConsolidacaoServidor({
      aprovacao_id: tentativaAprov.current.id,
      op_id: opAtual,
      quantidade_final: q,
      motivo: motivoAprov.trim(),
    })
    const m = mensagemDaAprovacao(r.http, r.corpo)
    setMsgAprov(textoSeguro(m.texto, 'Não foi possível registrar a decisão. Tente de novo.'))
    if (!m.manterId) tentativaAprov.current = null
    if (m.recarregar) await carregar()
    setEnviando(false)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Dupla conferência</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Confira o que foi produzido, encaixotado, recebido na expedição e levado para a câmara.
      </p>
      <ComoFunciona>
        <p>
          Produzido, encaixotado, recebido (expedição) e entrada em câmara são registros distintos.
          A divergência não é corrigida aqui: vai para revisão do PCP. Tudo fica guardado no
          servidor.
        </p>
        <p>
          Nada é enviado ao Omie por esta tela. Nova conferência ou novo apontamento invalida a
          aprovação anterior.
        </p>
      </ComoFunciona>

      {erroCarga && (
        <Aviso nivel="bloqueio" topo>
          Não foi possível carregar.{' '}
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </Aviso>
      )}

      {!erroCarga && estado && ordens.length === 0 && (
        <Aviso nivel="atencao">
          Ainda não há programação publicada. O PCP publica em Planejamento.
        </Aviso>
      )}

      {ordens.length > 0 && (
        <>
          <label className="mb-4 block max-w-md space-y-1 text-sm">
            <span className="text-muted-foreground">Ordem</span>
            <Escolha
              value={opAtual}
              onChange={setOpId}
              opcoes={ordens.map((o) => ({
                valor: o.op_id,
                rotulo: `${o.op_id} · ${o.produto} · ${o.data}`,
              }))}
            />
          </label>

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
                    disabled={!podeExp || enviando}
                    className={
                      fila?.quantidades.recebido_expedicao != null
                        ? 'bg-success text-success-foreground hover:bg-success/90 border-success'
                        : undefined
                    }
                  >
                    Conferir expedição
                    {fila?.quantidades.recebido_expedicao != null
                      ? `: ${fila.quantidades.recebido_expedicao} UN`
                      : ''}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => registrar('entrada_camara')}
                    disabled={!podeCam || enviando}
                    className={
                      fila?.quantidades.entrada_camara != null
                        ? 'bg-success text-success-foreground hover:bg-success/90 border-success'
                        : undefined
                    }
                  >
                    Conferir câmara
                    {fila?.quantidades.entrada_camara != null
                      ? `: ${fila.quantidades.entrada_camara} UN`
                      : ''}
                  </Button>
                </div>
                {!podeExp && !podeCam && (
                  <p className="text-xs text-warning" role="note">
                    Modo visualização: sua conta não confere nesta tela.
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
                  {fila?.estado === 'revisavel' ? (
                    <Badge className="bg-green-100 text-green-900 border-green-300">
                      Revisável
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-900">
                      Bloqueada
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {fila && (
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow className="text-left text-muted-foreground">
                        <TableHead className="pb-2">Etapa</TableHead>
                        <TableHead className="pb-2">Qtd (UN)</TableHead>
                        <TableHead className="pb-2">Delta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Produzido (cozinha)</TableCell>
                        <TableCell>{fila.quantidades.produzido}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Encaixotado</TableCell>
                        <TableCell>{fila.quantidades.encaixotado}</TableCell>
                        <TableCell>{fila.deltas.encaixotado}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Recebido (expedição)</TableCell>
                        <TableCell>
                          {fila.quantidades.recebido_expedicao ?? (
                            <span className="text-warning">ausente</span>
                          )}
                        </TableCell>
                        <TableCell>{fila.deltas.recebido ?? '—'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Entrada em câmara</TableCell>
                        <TableCell>
                          {fila.quantidades.entrada_camara ?? (
                            <span className="text-warning">ausente</span>
                          )}
                        </TableCell>
                        <TableCell>{fila.deltas.camara ?? '—'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
                {fila && fila.pendencias.length > 0 && (
                  <Aviso nivel="atencao">
                    <p className="font-medium">Pendências (nada é preenchido por padrão):</p>
                    <ul className="mt-1 list-disc list-inside">
                      {fila.pendencias.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </Aviso>
                )}
              </CardContent>
            </Card>
          </div>

          {aprova && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>Revisão do PCP</span>
                  {ativa ? (
                    <Badge variant="outline" className="border-success/30 text-success">
                      Aprovação ativa: {ativa.quantidade_final} UN
                    </Badge>
                  ) : (
                    <Badge variant="outline">Sem aprovação ativa</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <p className="text-muted-foreground">
                  Decidir a quantidade final com motivo registra a aprovação e prepara a ordem de
                  conclusão.
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
                      placeholder="Ex.: divergência revisada"
                    />
                  </label>
                </div>
                <Button
                  size="sm"
                  onClick={aprovar}
                  disabled={faltaConferencia || enviando}
                  title={
                    faltaConferencia
                      ? 'Registre as conferências de expedição e câmara antes de aprovar'
                      : 'Registra a decisão do PCP com motivo'
                  }
                >
                  Aprovar consolidação
                </Button>
                {ordemPreparada && (
                  <p className="text-xs text-muted-foreground">
                    Ordem de conclusão: {rotuloEstado(ordemPreparada.estado)} (
                    {ordemPreparada.quantidade} UN). O envio ao Omie é outra etapa, em Envio ao
                    Omie.
                  </p>
                )}
                {msgAprov && (
                  <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
                    {msgAprov}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">
                Conferências registradas ({registros.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {registros.length === 0 && (
                <p className="text-muted-foreground">Nenhuma conferência ainda.</p>
              )}
              {registros.length > 0 && (
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="text-left text-muted-foreground">
                      <TableHead className="pb-2">Etapa</TableHead>
                      <TableHead className="pb-2">Qtd</TableHead>
                      <TableHead className="pb-2">Autor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registros.map((r) => (
                      <TableRow key={r.registro_id}>
                        <TableCell>
                          {r.etapa === 'recebimento_expedicao' ? 'expedição' : 'câmara'}
                        </TableCell>
                        <TableCell>
                          {r.quantidade} {r.unidade}
                        </TableCell>
                        <TableCell className="text-xs">{r.autor}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default Conferencias
