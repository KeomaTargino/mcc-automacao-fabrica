import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  criarCalendario,
  RECURSOS_DEMO,
  PARAMETROS_DEMO,
  avaliarLinha,
  validarRascunho,
  publicarProgramacao,
  type LinhaProgramacao,
  type OPDigital,
} from '@/lib/pcp/planejamento'

const DIAS = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']

const Planejamento = () => {
  const calendario = useMemo(() => criarCalendario(), [])
  const [linhas, setLinhas] = useState<LinhaProgramacao[]>([])
  const [produto, setProduto] = useState('COOKIE-1')
  const [quantidade, setQuantidade] = useState('100')
  const [data, setData] = useState(DIAS[0])
  const [recurso, setRecurso] = useState('cookies')
  const [op, setOp] = useState<OPDigital | null>(null)
  const [resultado, setResultado] = useState<string>('')

  const validacao = useMemo(
    () => validarRascunho({ linhas, parametros: PARAMETROS_DEMO }, calendario, RECURSOS_DEMO),
    [linhas, calendario],
  )

  const adicionarLinha = () => {
    const q = Number(quantidade)
    if (!Number.isFinite(q) || q <= 0) return
    const linha = { produto, quantidade: q, data, recurso }
    const r = avaliarLinha(linha, {
      calendario,
      recursos: RECURSOS_DEMO,
      parametros: PARAMETROS_DEMO,
      fracoesUsadas: Object.fromEntries(linhas.map((l) => [`${l.recurso}|${l.data}`, 0])),
    })
    // Recalcular frações acumuladas corretamente por recurso|data
    const fracoes: Record<string, number> = {}
    for (const l of linhas) {
      const cap = RECURSOS_DEMO[l.recurso]?.capacidade_por_produto[l.produto]
      if (cap)
        fracoes[`${l.recurso}|${l.data}`] =
          (fracoes[`${l.recurso}|${l.data}`] ?? 0) + l.quantidade / cap
    }
    const r2 = avaliarLinha(linha, {
      calendario,
      recursos: RECURSOS_DEMO,
      parametros: PARAMETROS_DEMO,
      fracoesUsadas: fracoes,
    })
    setResultado(`${r2.estado}: ${r2.motivo}`)
    if (r2.estado === 'ok') setLinhas([...linhas, linha])
  }

  const publicar = () => {
    const r = publicarProgramacao(
      { linhas, parametros: PARAMETROS_DEMO },
      { acoes: ['publicar_programacao'], versao_esperada: 1 },
      calendario,
      RECURSOS_DEMO,
      { versao_atual: 1 },
    )
    if (r.estado === 'publicado') {
      setOp(r.op)
      setResultado(`Publicado: versão ${r.op.versao} com ${r.op.ops.length} OP(s) de demonstração.`)
    } else if (r.estado === 'bloqueado') {
      setResultado(`Bloqueado: ${r.bloqueios.join(' | ')}`)
    } else {
      setResultado(`${r.estado}: ${r.motivo}`)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Planejamento e OP digital</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Programação por recurso/data com capacidade por produto/dia. Publicação gera OP local
        versionada — nada sai para o ERP nesta demonstração.
      </p>

      <div
        className="mb-6 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        role="status"
      >
        <strong>Tela de demonstração.</strong> Calendário sintético (3 dias de cookies + 2 dias
        exclusivos), recursos e parâmetros são exemplos isolados. A publicação real (com parâmetros
        aprovados pelo PCP e dados reais) vem em outra task desta fase.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendário da semana (demonstração)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {calendario.dias.map((d) => (
              <div
                key={d.data}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="font-mono text-xs">{d.data}</span>
                <span className="flex gap-1">
                  {d.recursos.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">
                      {r}
                    </Badge>
                  ))}
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
                  min={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Data</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                >
                  {DIAS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Recurso</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={recurso}
                  onChange={(e) => setRecurso(e.target.value)}
                >
                  <option value="cookies">cookies</option>
                  <option value="compartilhado">compartilhado</option>
                </select>
              </label>
            </div>
            <Button size="sm" onClick={adicionarLinha}>
              Avaliar e adicionar
            </Button>
            {resultado && (
              <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
                {resultado}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Rascunho — {linhas.length} linha(s)</span>
            {validacao.pode_publicar && linhas.length > 0 ? (
              <Badge className="bg-green-100 text-green-900 border-green-300">
                Pronto para publicar
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 text-amber-900">
                {linhas.length === 0 ? 'Sem linhas' : `${validacao.linhas_recusadas} recusada(s)`}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {linhas.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Produto</th>
                  <th className="pb-2">Qtd</th>
                  <th className="pb-2">Data</th>
                  <th className="pb-2">Recurso</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1">{l.produto}</td>
                    <td>{l.quantidade}</td>
                    <td className="font-mono text-xs">{l.data}</td>
                    <td>{l.recurso}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {validacao.bloqueios.length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="alert"
            >
              <p className="font-medium">Bloqueios de publicação (o rascunho permanece):</p>
              <ul className="mt-1 list-disc list-inside">
                {validacao.bloqueios.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={publicar} disabled={linhas.length === 0}>
            Publicar programação (demonstração)
          </Button>
        </CardContent>
      </Card>

      {op && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              OP digital publicada — versão {op.versao} ({op.contexto})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              {op.ops.length} OP(s) geradas, todas vinculadas à versão {op.versao} e ao contexto
              sintético — nenhuma chamada ao ERP.
            </p>
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">OP</th>
                  <th className="pb-2">Produto</th>
                  <th className="pb-2">Qtd</th>
                  <th className="pb-2">Data</th>
                  <th className="pb-2">Recurso</th>
                </tr>
              </thead>
              <tbody>
                {op.ops.map((o) => (
                  <tr key={o.op_id}>
                    <td className="py-1 font-mono text-xs">{o.op_id}</td>
                    <td>{o.produto}</td>
                    <td>
                      {o.quantidade} {o.unidade}
                    </td>
                    <td className="font-mono text-xs">{o.data}</td>
                    <td>{o.recurso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Planejamento
