import { useEffect, useState } from 'react'
import { obterDados, type RespostaDados } from '@/services/pcp-access'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type DadosArea = NonNullable<RespostaDados['dados']>

function BlocoSemPermissao() {
  return <p className="text-sm text-muted-foreground">Sem permissão para esta área.</p>
}

function Bloco({
  titulo,
  permitido,
  children,
}: {
  titulo: string
  permitido: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{permitido ? children : <BlocoSemPermissao />}</CardContent>
    </Card>
  )
}

const Painel = () => {
  const [resposta, setResposta] = useState<RespostaDados | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    obterDados()
      .then((r) => {
        if (vivo) setResposta(r)
      })
      .catch((err) => {
        if (vivo) setErro(err?.message ?? 'Falha ao carregar os dados.')
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  const areas = resposta?.areas_permitidas ?? []
  const dados = (resposta?.dados ?? {}) as DadosArea
  const tem = (a: string) => areas.includes(a)

  if (carregando) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground" role="status">
          Carregando…
        </p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div
        className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        Dados de demonstração — fontes ainda não conectadas.
      </div>

      {erro && (
        <div
          className="mb-6 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {erro}
        </div>
      )}

      <h1 className="text-3xl font-bold mb-6">Painel operacional</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Bloco titulo="Estoque" permitido={tem('estoque')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Produto</th>
                <th className="pb-2">Local</th>
                <th className="pb-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {(dados.estoque ?? []).map((e: any) => (
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

        <Bloco titulo="Produção" permitido={tem('producao')}>
          <ul className="text-sm space-y-2">
            {(dados.producao ?? []).map((op: any) => (
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

        <Bloco titulo="Compras" permitido={tem('compras')}>
          <ul className="text-sm space-y-2">
            {(dados.compras ?? []).map((c: any) => (
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

        <Bloco titulo="Pedidos" permitido={tem('pedidos')}>
          <ul className="text-sm space-y-2">
            {(dados.pedidos ?? []).map((p: any) => (
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
