import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CAMPOS,
  aprovarParametrosAlerta,
  obterParametrosAlerta,
  salvarFamilia,
  type DocParametrosAlerta,
  type ParametroAlerta,
  type RespostaParametrosAlerta,
} from '@/services/pcp-alertas'

const TIPOS_GRAV = [
  ['producao', 'Produção atrasada'],
  ['compra', 'Compra'],
  ['preco', 'Preço'],
  ['pedido', 'Pedido parado'],
  ['divergencia', 'Divergência'],
] as const

const campo = 'border rounded px-2 py-1 text-sm bg-background'

const ParametrosAlerta = () => {
  const [dados, setDados] = useState<RespostaParametrosAlerta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [itens, setItens] = useState<ParametroAlerta[]>([])
  const [grav, setGrav] = useState<DocParametrosAlerta['gravidade']>({})
  const [novoEscopo, setNovoEscopo] = useState<'produto' | 'familia'>('produto')
  const [novaChave, setNovaChave] = useState('')
  const [familia, setFamilia] = useState('')
  const [produtos, setProdutos] = useState('')

  const carregar = () =>
    obterParametrosAlerta()
      .then((r) => {
        setDados(r)
        setItens(r.vigente?.parametros?.itens ?? [])
        setGrav(r.vigente?.parametros?.gravidade ?? {})
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? 'Sua conta não tem acesso a esta tela.'
            : 'Não foi possível carregar agora.',
        ),
      )
  useEffect(() => {
    carregar()
  }, [])

  const mudar = (i: number, c: string, v: string) =>
    setItens((l) =>
      l.map((x, k) => {
        if (k !== i) return x
        const novo: any = { ...x }
        if (v === '') delete novo[c]
        else novo[c] = Number(v)
        return novo
      }),
    )

  const aprovar = () => {
    setMsg(null)
    aprovarParametrosAlerta({
      itens,
      gravidade: grav,
      versao_esperada: dados?.vigente?.versao ?? 0,
    })
      .then((r) => {
        setMsg(
          r.estado === 'replay'
            ? 'Nada mudou: é a versão vigente.'
            : `Versão ${r.versao} aprovada.`,
        )
        carregar()
      })
      .catch((e: any) =>
        setMsg(
          e?.status === 403
            ? 'Sua conta não tem a ação editar parâmetros.'
            : e?.status === 409
              ? 'Outra aprovação chegou antes; recarreguei a tela.'
              : e?.response?.motivos?.join(' ') || 'Não foi possível aprovar agora.',
        ),
      )
    // recarrega em caso de conflito para trazer a versão nova
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Parâmetros de alerta</h1>
      <p className="text-sm text-muted-foreground mb-2">
        Por produto ou por família; o do produto vale mais que o da família, campo a campo. Campo
        vazio é lacuna: o alerta daquele item não é calculado, nunca usa valor padrão. A linha de
        família <span className="font-mono">*</span> guarda os parâmetros gerais (por exemplo, o
        tempo máximo de pedido parado).{' '}
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
      {dados && (
        <>
          <p className="text-xs mb-4">
            {dados.vigente
              ? `Versão vigente ${dados.vigente.versao}, aprovada por ${dados.vigente.aprovador} em ${new Date(dados.vigente.aprovado_em).toLocaleString('pt-BR')}.`
              : 'Ainda sem parâmetros de alerta aprovados: nenhum alerta é calculado.'}
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Gravidade por tipo (na versão aprovada)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 text-sm">
              {TIPOS_GRAV.map(([t, r]) => (
                <label key={t} className="flex items-center gap-2">
                  {r}
                  <select
                    className={campo}
                    value={grav[t] ?? ''}
                    disabled={!dados.pode_editar}
                    onChange={(e) =>
                      setGrav((g) => ({ ...g, [t]: (e.target.value || undefined) as any }))
                    }
                  >
                    <option value="">não definida</option>
                    <option value="atencao">atenção</option>
                    <option value="critico">crítico</option>
                  </select>
                </label>
              ))}
              <span className="text-xs text-muted-foreground">
                A ruptura de estoque é crítica quando o saldo projetado chega a zero.
              </span>
            </CardContent>
          </Card>
          <div className="space-y-3 mb-4">
            {itens.map((p, i) => (
              <Card key={`${p.escopo}-${p.chave}`}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {p.escopo === 'produto' ? 'Produto' : 'Família'}{' '}
                    <span className="font-mono">{p.chave}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                  {CAMPOS.map((c) => (
                    <label key={c.campo} className="block">
                      {c.rotulo}
                      <input
                        className={`${campo} w-full`}
                        inputMode="decimal"
                        value={p[c.campo] ?? ''}
                        disabled={!dados.pode_editar}
                        onChange={(e) => mudar(i, c.campo, e.target.value)}
                      />
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          {dados.pode_editar && (
            <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
              <select
                className={campo}
                value={novoEscopo}
                onChange={(e) => setNovoEscopo(e.target.value as any)}
              >
                <option value="produto">Produto</option>
                <option value="familia">Família</option>
              </select>
              <input
                className={campo}
                placeholder="código ou nome"
                value={novaChave}
                onChange={(e) => setNovaChave(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!novaChave.trim()}
                onClick={() => {
                  setItens((l) => [...l, { escopo: novoEscopo, chave: novaChave.trim() }])
                  setNovaChave('')
                }}
              >
                Acrescentar
              </Button>
              <Button size="sm" onClick={aprovar}>
                Aprovar nova versão
              </Button>
            </div>
          )}
          {msg && (
            <p className="text-sm mb-4" role="status">
              {msg}
            </p>
          )}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">Famílias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(dados.familias).map(([f, p]) => (
                <div key={f}>
                  <strong>{f}</strong>: {p.join(', ')}
                </div>
              ))}
              {Object.keys(dados.familias).length === 0 && <div>Nenhuma família definida.</div>}
              {dados.pode_editar && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <input
                    className={campo}
                    placeholder="família"
                    value={familia}
                    onChange={(e) => setFamilia(e.target.value)}
                  />
                  <input
                    className={`${campo} w-72`}
                    placeholder="produtos separados por vírgula"
                    value={produtos}
                    onChange={(e) => setProdutos(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!familia.trim()}
                    onClick={() =>
                      salvarFamilia({
                        familia,
                        produtos: produtos
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                        .then(() => carregar())
                        .catch(() => setMsg('Não foi possível salvar a família.'))
                    }
                  >
                    Salvar família
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lacunas ({dados.lacunas.length})</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {dados.lacunas.length === 0 && <div>Nenhuma lacuna na última rodada.</div>}
              {dados.lacunas.map((l) => (
                <div key={`${l.regra}|${l.item}|${l.campo}`}>
                  <span className="font-mono">{l.item}</span> — {l.motivo}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

export default ParametrosAlerta
