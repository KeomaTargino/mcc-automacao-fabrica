import { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { obterPerfil } from '@/services/pcp-access'
import { obterParametros, aprovarParametrosServidor } from '@/services/pcp-parametros'
import { validarParametros, type Parametros } from '@/lib/pcp/parametros'

// Tela de parâmetros oficiais — SPEC-2-002 CA-P1/P2 (task d2a44349).
// O PCP aprova aqui os parâmetros oficiais (CL-006): capacidade, lote, horizonte
// e recursos com unidade. Servidor decide: gate editar_parametros no POST; a
// aprovação vigente (versão/aprovador/hora/hash) vem do servidor; sem aprovação
// a publicação real fica bloqueada (origem demonstracao) — nunca default.
const Parametros = () => {
  const [acoes, setAcoes] = useState<string[]>([])
  const [usuario, setUsuario] = useState('')
  const [aprovacao, setAprovacao] = useState<{
    versao: number
    aprovador: string
    aprovado_em: string
    hash_parametros: string
  } | null>(null)
  const [origem, setOrigem] = useState<'aprovada' | 'demonstracao'>('demonstracao')
  const [capacidade, setCapacidade] = useState('')
  const [lote, setLote] = useState('')
  const [horizonte, setHorizonte] = useState('')
  const [recursos, setRecursos] = useState<{ nome: string; unidade: string; fracao: string }[]>([
    { nome: 'cookies', unidade: '', fracao: '' },
  ])
  const [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterPerfil()
      .then((r) => {
        setAcoes(r?.perfil?.acoes ?? [])
        setUsuario(r?.perfil?.usuario ?? '')
      })
      .catch(() => setAcoes([]))
    obterParametros()
      .then((r) => {
        setAprovacao(r.aprovacao)
        setOrigem(r.origem)
        if (r.aprovacao?.parametros) {
          const p = r.aprovacao.parametros as any
          setCapacidade(p.capacidade_padrao != null ? String(p.capacidade_padrao) : '')
          setLote(p.lote_multiplo != null ? String(p.lote_multiplo) : '')
          setHorizonte(p.horizonte_dias != null ? String(p.horizonte_dias) : '')
          if (Array.isArray(p.recursos) && p.recursos.length > 0) {
            setRecursos(
              p.recursos.map((x: any) => ({
                nome: String(x.nome ?? ''),
                unidade: String(x.unidade ?? ''),
                fracao: x.capacidade_fracao != null ? String(x.capacidade_fracao) : '',
              })),
            )
          }
        }
        setCarregando(false)
      })
      .catch(() => {
        setOrigem('demonstracao')
        setCarregando(false)
      })
  }, [])

  const montarParametros = (): Parametros => ({
    capacidade_padrao: capacidade === '' ? null : Number(capacidade),
    lote_multiplo: lote === '' ? null : Number(lote),
    horizonte_dias: horizonte === '' ? null : Number(horizonte),
    recursos: recursos.map((r) => ({
      nome: r.nome,
      unidade: r.unidade === '' ? null : r.unidade,
      capacidade_fracao: r.fracao === '' ? null : Number(r.fracao),
      capacidade_por_produto: {},
    })),
  })

  const validacao = useMemo(
    () => validarParametros(montarParametros()),
    [capacidade, lote, horizonte, recursos],
  )

  const aprovar = () => {
    const p = montarParametros()
    aprovarParametrosServidor(p, aprovacao?.versao ?? 0)
      .then((r) => {
        if (r.estado === 'aprovado' || r.estado === 'replay') {
          setAprovacao({
            versao: r.aprovacao?.versao ?? aprovacao?.versao ?? 0,
            aprovador: r.aprovacao?.aprovador ?? usuario,
            aprovado_em: r.aprovacao?.aprovado_em ?? '',
            hash_parametros: r.aprovacao?.hash_parametros ?? '',
          })
          setOrigem('aprovada')
          setMensagem(
            r.estado === 'replay'
              ? 'Replay: aprovação idêntica já registrada — nada duplicado.'
              : `Aprovado: versão ${r.aprovacao?.versao} registrada.`,
          )
        } else if (r.estado === 'conflito_versao') {
          setMensagem(
            `409: os parâmetros divergem da aprovação vigente (v${r.versao_atual}) — recarregue e reaprove.`,
          )
        } else {
          setMensagem(`${r.estado}: ${JSON.stringify(r)}`)
        }
      })
      .catch((err: any) => {
        setMensagem(`Erro: ${err?.response?.data?.message ?? err?.message ?? String(err)}`)
      })
  }

  const podeAprovar = acoes.includes('editar_parametros')

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Parâmetros de produção</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Parâmetros oficiais (CL-006): capacidade diária, lote/múltiplo, horizonte e recursos com
        unidade. Aprovação registra versão, aprovador e hora — reprodutível. Sem aprovação, a
        publicação real permanece bloqueada.
      </p>

      <div
        className={`mb-6 rounded-md border px-4 py-3 text-sm ${
          origem === 'aprovada'
            ? 'border-green-300 bg-green-50 text-green-900'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
        role="status"
      >
        {origem === 'aprovada' ? (
          <>
            <strong>Parâmetros oficiais aprovados</strong> — versão {aprovacao?.versao} por{' '}
            {aprovacao?.aprovador} em {aprovacao?.aprovado_em?.slice(0, 19).replace('T', ' ')} UTC
            (hash {aprovacao?.hash_parametros?.slice(0, 8)}…).
          </>
        ) : (
          <>
            <strong>Sem aprovação vigente.</strong> Os parâmetros de demonstração continuam
            isolados; a publicação real fica bloqueada até o PCP aprovar aqui.
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Valores oficiais</span>
            {podeAprovar ? (
              <Badge className="bg-green-100 text-green-900 border-green-300">
                editar_parametros ok
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 text-amber-900">
                sem editar_parametros (403)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground">Capacidade padrão/dia</span>
              <Input
                type="number"
                min={1}
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
                placeholder="ex.: 100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Lote/múltiplo</span>
              <Input
                type="number"
                min={1}
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                placeholder="ex.: 10"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">Horizonte (dias)</span>
              <Input
                type="number"
                min={1}
                value={horizonte}
                onChange={(e) => setHorizonte(e.target.value)}
                placeholder="ex.: 5"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Recursos (unidade obrigatória — nunca presumida)</p>
            {recursos.map((r, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <Input
                  value={r.nome}
                  onChange={(e) => {
                    const n = [...recursos]
                    n[i] = { ...n[i], nome: e.target.value }
                    setRecursos(n)
                  }}
                  placeholder="nome do recurso"
                />
                <Input
                  value={r.unidade}
                  onChange={(e) => {
                    const n = [...recursos]
                    n[i] = { ...n[i], unidade: e.target.value }
                    setRecursos(n)
                  }}
                  placeholder="unidade (ex.: UN)"
                />
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={r.fracao}
                  onChange={(e) => {
                    const n = [...recursos]
                    n[i] = { ...n[i], fracao: e.target.value }
                    setRecursos(n)
                  }}
                  placeholder="fração (0–1]"
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecursos([...recursos, { nome: '', unidade: '', fracao: '' }])}
            >
              Adicionar recurso
            </Button>
          </div>

          {validacao.bloqueios.length > 0 && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="alert"
            >
              <p className="font-medium">Bloqueios (faltante nunca vira default):</p>
              <ul className="mt-1 list-disc list-inside">
                {validacao.bloqueios.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <Button onClick={aprovar} disabled={!podeAprovar || !validacao.aprovavel}>
            Aprovar parâmetros
          </Button>
          {mensagem && (
            <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
              {mensagem}
            </div>
          )}
          <p className="text-xs text-muted-foreground" role="note">
            Ações do seu perfil (servidor): {acoes.length > 0 ? acoes.join(', ') : 'carregando…'}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Parametros
