import { useEffect, useState } from 'react'
import {
  criarProviderDemonstracao,
  type ResultadoLeitura,
  type RecursosPCP,
} from '@/lib/pcp/provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Modo = 'ok' | 'vazio' | 'indisponivel' | 'falha'

function BlocoEstado({ estado, erro }: { estado: string; erro?: string }) {
  if (estado === 'vazio') {
    return <p className="text-sm text-muted-foreground">Nenhum registro no momento.</p>
  }
  if (estado === 'indisponivel') {
    return (
      <p className="text-sm text-amber-600">
        Fonte indisponível no momento. Tente novamente mais tarde.
      </p>
    )
  }
  return <p className="text-sm text-destructive">{erro ?? 'Falha na leitura dos dados.'}</p>
}

function Bloco({
  titulo,
  estado,
  erro,
  children,
}: {
  titulo: string
  estado: string
  erro?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {estado === 'ok' ? children : <BlocoEstado estado={estado} erro={erro} />}
      </CardContent>
    </Card>
  )
}

const Painel = () => {
  const [modo, setModo] = useState<Modo>('ok')
  const [leitura, setLeitura] = useState<ResultadoLeitura<RecursosPCP> | null>(null)

  useEffect(() => {
    const provider = criarProviderDemonstracao(modo)
    provider.ler().then(setLeitura)
  }, [modo])

  const dados = leitura?.dados ?? null

  return (
    <div className="container mx-auto py-8 px-4">
      <div
        className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        Dados de demonstração — fontes ainda não conectadas.
      </div>

      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Simular estado da fonte:</span>
        <div className="flex gap-2">
          {(['ok', 'vazio', 'indisponivel', 'falha'] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`rounded-md border px-3 py-1 text-sm capitalize ${
                modo === m ? 'bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-6">Painel operacional</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Bloco titulo="Estoque" estado={leitura?.estado ?? 'falha'} erro={leitura?.erro}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Produto</th>
                <th className="pb-2">Local</th>
                <th className="pb-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {dados?.estoque.map((e) => (
                <tr key={`${e.produto_id}-${e.local}-${e.unidade}`}>
                  <td className="py-1">
                    {e.codigo} — {e.descricao}
                  </td>
                  <td>{e.local}</td>
                  <td className="text-right">
                    {e.saldo} {e.unidade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloco>

        <Bloco titulo="Produção" estado={leitura?.estado ?? 'falha'} erro={leitura?.erro}>
          <ul className="text-sm space-y-2">
            {dados?.producao.map((op) => (
              <li key={op.documento_id} className="flex items-center justify-between">
                <span>
                  {op.documento_id} — {op.produto}
                </span>
                <span className="flex items-center gap-2">
                  <span>
                    {op.quantidade} {op.unidade}
                  </span>
                  <Badge variant="outline">{op.status_original}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Bloco>

        <Bloco titulo="Compras" estado={leitura?.estado ?? 'falha'} erro={leitura?.erro}>
          <ul className="text-sm space-y-2">
            {dados?.compras.map((c) => (
              <li key={c.documento_id} className="flex items-center justify-between">
                <span>
                  {c.documento_id} — {c.item}
                </span>
                <span className="flex items-center gap-2">
                  <span>
                    {c.quantidade} {c.unidade}
                  </span>
                  <Badge variant="outline">{c.status_original}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Bloco>

        <Bloco titulo="Pedidos" estado={leitura?.estado ?? 'falha'} erro={leitura?.erro}>
          <ul className="text-sm space-y-2">
            {dados?.pedidos.map((p) => (
              <li key={p.documento_id} className="flex items-center justify-between">
                <span>
                  {p.documento_id}{' '}
                  <Badge variant={p.oficial ? 'default' : 'secondary'}>
                    {p.canal === 'omie' ? 'Oficial (Omie)' : 'Intenção (Nuvemshop)'}
                  </Badge>
                </span>
                <span className="flex items-center gap-2">
                  <span>{p.cliente}</span>
                  <Badge variant="outline">{p.status_original}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Bloco>
      </div>
    </div>
  )
}

export default Painel
