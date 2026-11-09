import { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import { obterPerfil } from '@/services/pcp-access'
import { obterParametros, aprovarParametrosServidor } from '@/services/pcp-parametros'
import { validarParametros, type Parametros } from '@/lib/pcp/parametros'
import Aviso from '@/components/Aviso'

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
  const [recursos, setRecursos] = useState<
    { nome: string; unidade: string; fracao: string; dias: number[] }[]
  >([{ nome: 'cookies', unidade: '', fracao: '', dias: [] }])
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
                dias: Array.isArray(x.dias_producao) ? x.dias_producao : [],
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
      dias_producao: r.dias,
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
              ? 'Já registrado: esta aprovação é igual à vigente — nada foi duplicado.'
              : `Aprovado: versão ${r.aprovacao?.versao} registrada.`,
          )
        } else if (r.estado === 'conflito_versao') {
          setMensagem(
            `Os parâmetros divergem da aprovação vigente (versão ${r.versao_atual}). Recarregue a tela e aprove de novo.`,
          )
        } else {
          setMensagem('Não foi possível aprovar. Confira os campos destacados.')
        }
      })
      .catch((err: any) => {
        setMensagem(mensagemDeErro(err))
      })
  }

  const podeAprovar = acoes.includes('editar_parametros')

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Parâmetros de produção</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Capacidade diária, lote, horizonte e recursos que valem para a programação.
      </p>
      <ComoFunciona>
        <p>
          A aprovação registra a versão, quem aprovou e a hora, para que a conta possa ser refeita.
          Sem aprovação, a programação não pode ser publicada.
        </p>
      </ComoFunciona>

      <div
        className={`mb-6 rounded-md border px-4 py-3 text-sm ${
          origem === 'aprovada'
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-warning/30 bg-warning/10 text-warning'
        }`}
        role="status"
      >
        {origem === 'aprovada' ? (
          <>
            <strong>Parâmetros oficiais aprovados</strong> — versão {aprovacao?.versao} por{' '}
            {aprovacao?.aprovador} em {aprovacao?.aprovado_em?.slice(0, 19).replace('T', ' ')} UTC.
          </>
        ) : (
          <>
            <strong>Sem aprovação vigente.</strong> Os dados de demonstração ficam separados; a
            programação real só pode ser publicada depois que o PCP aprovar aqui.
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Valores oficiais</span>
            {podeAprovar ? (
              <Badge className="bg-success/10 text-success border-success/30">
                Você pode aprovar
              </Badge>
            ) : (
              <Badge variant="outline" className="border-warning/30 text-warning">
                Você não tem acesso a esta ação. Fale com o gestor.
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
                <div className="col-span-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Dias de produção:</span>
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((nome, d) => (
                    <label key={d} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={r.dias.includes(d)}
                        onChange={(e) => {
                          const n = [...recursos]
                          const dias = e.target.checked
                            ? [...n[i].dias, d].sort()
                            : n[i].dias.filter((x) => x !== d)
                          n[i] = { ...n[i], dias }
                          setRecursos(n)
                        }}
                      />
                      {nome}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRecursos([...recursos, { nome: '', unidade: '', fracao: '', dias: [] }])
              }
            >
              Adicionar recurso
            </Button>
          </div>

          {validacao.bloqueios.length > 0 && (
            <Aviso nivel="atencao" topo>
              <p className="font-medium">O que falta para aprovar (nada é preenchido sozinho):</p>
              <ul className="mt-1 list-disc list-inside">
                {validacao.bloqueios.map((b, i) => (
                  <li key={i}>{textoSeguro(b, 'Complete os campos destacados.')}</li>
                ))}
              </ul>
            </Aviso>
          )}

          <Button onClick={aprovar} disabled={!podeAprovar || !validacao.aprovavel}>
            Aprovar parâmetros
          </Button>
          {mensagem && (
            <div className="rounded-md border px-3 py-2 text-xs bg-muted" role="status">
              {mensagem}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Parametros
