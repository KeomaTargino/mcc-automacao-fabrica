import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { textoSeguro } from '@/lib/pcp/textos'
import { avaliarLinha, validarRascunho, type LinhaProgramacao } from '@/lib/pcp/planejamento'
import {
  calendarioDosParametros,
  mensagemDaPublicacao,
  situacaoPublicar,
  type ParametrosAprovados,
} from '@/lib/pcp/planejamento-servidor'
import { obterParametros } from '@/services/pcp-parametros'
import {
  lerEstadoProducao,
  publicarProgramacaoServidor,
  type EstadoProducao,
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
import { toast } from 'sonner'

// Planejamento: a programação fica no servidor (SPEC-4-001). Os parâmetros e o calendário vêm da versão
// aprovada em /parametros; sem eles, "Publicar" fica desabilitado. A tela relê o estado a cada 30 segundos
// e quando volta a ter foco. A conta de capacidade continua em src/lib/pcp/planejamento.ts.
const hojeIso = () => new Date().toISOString().slice(0, 10)

const Planejamento = () => {
  const [parametros, setParametros] = useState<ParametrosAprovados | null>(null)
  const [estado, setEstado] = useState<EstadoProducao | null>(null)
  const [erroCarga, setErroCarga] = useState(false)
  const [linhas, setLinhas] = useState<LinhaProgramacao[]>([])
  const [produto, setProduto] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [data, setData] = useState('')
  const [recurso, setRecurso] = useState('')
  const [resultado, setResultado] = useState('')
  const [publicando, setPublicando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([obterParametros(), lerEstadoProducao()])
      setParametros((p.aprovacao?.parametros as ParametrosAprovados | undefined) ?? null)
      setEstado(e)
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

  const situacao = useMemo(() => situacaoPublicar(parametros), [parametros])
  const calendario = useMemo(
    () => (parametros && situacao.pode ? calendarioDosParametros(parametros, hojeIso()) : null),
    [parametros, situacao],
  )
  const diasComRecurso = calendario?.dias.filter((d) => d.recursos.length > 0) ?? []
  const nomesRecursos = situacao.pode ? Object.keys(situacao.recursos) : []

  const validacao = useMemo(
    () =>
      situacao.pode && calendario
        ? validarRascunho(
            { linhas, parametros: situacao.parametros },
            calendario,
            situacao.recursos,
          )
        : null,
    [linhas, situacao, calendario],
  )

  const adicionarLinha = () => {
    if (!situacao.pode || !calendario) return
    const q = Number(quantidade)
    if (!produto.trim() || !Number.isFinite(q) || q <= 0 || !data || !recurso) {
      setResultado('Preencha produto, quantidade maior que zero, data e recurso.')
      return
    }
    const linha = { produto: produto.trim().toUpperCase(), quantidade: q, data, recurso }
    const fracoes: Record<string, number> = {}
    for (const l of linhas) {
      const cap =
        situacao.recursos[l.recurso]?.capacidade_por_produto[l.produto] ??
        situacao.parametros.capacidade_padrao
      if (cap)
        fracoes[`${l.recurso}|${l.data}`] =
          (fracoes[`${l.recurso}|${l.data}`] ?? 0) + l.quantidade / cap
    }
    const r = avaliarLinha(linha, {
      calendario,
      recursos: situacao.recursos,
      parametros: situacao.parametros,
      fracoesUsadas: fracoes,
    })
    setResultado(textoSeguro(r.motivo))
    if (r.estado === 'ok') setLinhas([...linhas, linha])
  }

  const publicar = async () => {
    if (!estado || !situacao.pode || linhas.length === 0) return
    setPublicando(true)
    const r = await publicarProgramacaoServidor(estado.programacao?.versao ?? 0, linhas)
    const m = mensagemDaPublicacao(r.http, r.corpo)
    setResultado(textoSeguro(m.texto, 'Não foi possível publicar. Tente de novo.'))
    if (m.ok) toast.success(textoSeguro(m.texto, 'Programação publicada.'), { duration: 4000 })
    else
      toast.error(textoSeguro(m.texto, 'Não foi possível publicar.'), {
        duration: Infinity,
        closeButton: true,
      })
    if (m.ok) setLinhas([])
    if (m.recarregar) await carregar()
    setPublicando(false)
  }

  const publicada = estado?.programacao ?? null

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Planejamento</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Programação por recurso e dia, com a capacidade e o calendário aprovados.
      </p>
      <ComoFunciona>
        <p>
          A programação publicada fica guardada no servidor e todos veem a mesma versão. A tela
          confere a capacidade de cada recurso por dia antes de aceitar uma linha.
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

      {!situacao.pode && !erroCarga && (
        <Aviso nivel="atencao">
          {textoSeguro(situacao.motivo, 'Aprove os parâmetros antes de publicar.')}.
        </Aviso>
      )}

      {situacao.pode && calendario && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calendário aprovado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {calendario.dias.map((d) => (
                <div
                  key={d.data}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="font-mono text-xs">{d.data}</span>
                  <span className="flex gap-1">
                    {d.recursos.length === 0 ? (
                      <span className="text-xs text-muted-foreground">sem produção</span>
                    ) : (
                      d.recursos.map((r) => (
                        <Badge key={r} variant="outline" className="text-xs">
                          {r}
                        </Badge>
                      ))
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adicionar linha ao rascunho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-muted-foreground">Produto</span>
                  <Input value={produto} onChange={(e) => setProduto(e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Quantidade</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Data</span>
                  <Escolha
                    value={data}
                    onChange={setData}
                    opcoes={diasComRecurso.map((d) => ({ valor: d.data, rotulo: d.data }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Recurso</span>
                  <Escolha
                    value={recurso}
                    onChange={setRecurso}
                    opcoes={nomesRecursos.map((r) => ({ valor: r, rotulo: r }))}
                  />
                </label>
              </div>
              <Button size="sm" onClick={adicionarLinha}>
                Avaliar e adicionar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {resultado && (
        <div className="mt-4 rounded-md border px-3 py-2 text-xs bg-muted" role="status">
          {resultado}
        </div>
      )}

      {situacao.pode && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span>Rascunho — {linhas.length} linha(s)</span>
              {validacao?.pode_publicar && linhas.length > 0 ? (
                <Badge className="bg-success/10 text-success border-success/30">
                  Pronto para publicar
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning/30 text-warning">
                  {linhas.length === 0
                    ? 'Sem linhas'
                    : `${validacao?.linhas_recusadas ?? 0} recusada(s)`}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {linhas.length > 0 && (
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="text-left text-muted-foreground">
                    <TableHead className="pb-2">Produto</TableHead>
                    <TableHead className="pb-2">Qtd</TableHead>
                    <TableHead className="pb-2">Data</TableHead>
                    <TableHead className="pb-2">Recurso</TableHead>
                    <TableHead className="pb-2"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-1">{l.produto}</TableCell>
                      <TableCell>{l.quantidade}</TableCell>
                      <TableCell className="font-mono text-xs">{l.data}</TableCell>
                      <TableCell>{l.recurso}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                        >
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Button
              onClick={publicar}
              disabled={linhas.length === 0 || publicando || !validacao?.pode_publicar}
            >
              Publicar programação
            </Button>
          </CardContent>
        </Card>
      )}

      {publicada && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Programação publicada — versão {publicada.versao}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-xs text-muted-foreground">
              Publicada por {publicada.publicada_por} em{' '}
              {publicada.publicada_em?.slice(0, 16).replace('T', ' ')}. A tela relê o servidor a
              cada 30 segundos.
            </p>
            <Table className="w-full">
              <TableHeader>
                <TableRow className="text-left text-muted-foreground">
                  <TableHead className="pb-2">Ordem</TableHead>
                  <TableHead className="pb-2">Produto</TableHead>
                  <TableHead className="pb-2">Qtd</TableHead>
                  <TableHead className="pb-2">Data</TableHead>
                  <TableHead className="pb-2">Recurso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publicada.ops.map((o) => (
                  <TableRow key={o.op_id}>
                    <TableCell className="py-1 font-mono text-xs">{o.op_id}</TableCell>
                    <TableCell>{o.produto}</TableCell>
                    <TableCell>{o.quantidade}</TableCell>
                    <TableCell className="font-mono text-xs">{o.data}</TableCell>
                    <TableCell>{o.recurso}</TableCell>
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

export default Planejamento
