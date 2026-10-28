import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { obterConversoes, salvarConversao, type RespostaConversoes } from '@/services/pcp-compras'

const textoDoErro = (e: any): string => {
  const d = e?.response ?? e?.data
  if (Array.isArray(d?.motivos)) return d.motivos.join('; ')
  return d?.motivo || d?.message || 'Não foi possível salvar agora. Tente de novo em instantes.'
}

const Conversoes = () => {
  const [dados, setDados] = useState<RespostaConversoes | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [item, setItem] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [apresentacao, setApresentacao] = useState('')
  const [unidadeCompra, setUnidadeCompra] = useState('')
  const [fator, setFator] = useState('')

  const carregar = useCallback(() => {
    obterConversoes()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? 'Sua conta não tem acesso a esta tela.'
            : 'Não foi possível carregar as conversões agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const salvar = async () => {
    setAviso(null)
    try {
      const r = await salvarConversao({
        item,
        fornecedor,
        apresentacao,
        unidade_compra: unidadeCompra,
        fator: Number(fator),
      })
      setAviso(`Salvo: versão ${r.versao} do fator de ${r.item} (estoque em ${r.unidade_estoque}).`)
      setFator('')
      carregar()
    } catch (e: any) {
      setAviso(textoDoErro(e))
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Conversão de unidades</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A quantidade de compra só vira unidade de estoque por um fator confirmado por Compras (por
        exemplo, 1 saco de 25 kg = 25 KG). Sem fator, a quantidade fica na unidade de compra e o
        preço não é comparado. Mudar o fator cria uma versão nova; documentos antigos mantêm o que
        usaram.
      </p>
      {erro && (
        <div
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {erro}
        </div>
      )}
      {!erro && !dados && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}

      {dados?.pode_editar && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Confirmar um fator (cria uma versão)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Código do item no Omie"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              />
              <Input
                placeholder="Fornecedor (opcional; vazio = fator geral)"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
              />
              <Input
                placeholder="Apresentação de compra (ex.: saco 25 kg)"
                value={apresentacao}
                onChange={(e) => setApresentacao(e.target.value)}
              />
              <Input
                placeholder="Unidade de compra (ex.: SC)"
                value={unidadeCompra}
                onChange={(e) => setUnidadeCompra(e.target.value)}
              />
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="Fator"
                value={fator}
                onChange={(e) => setFator(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A unidade de estoque é a do cadastro do Omie; item fora do catálogo ou sem unidade não
              aceita fator.
            </p>
            <Button
              size="sm"
              disabled={
                !item.trim() || !apresentacao.trim() || !unidadeCompra.trim() || !fator.trim()
              }
              onClick={salvar}
            >
              Confirmar fator
            </Button>
          </CardContent>
        </Card>
      )}

      {dados && dados.itens.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">
            Nenhum fator confirmado ainda. Itens sem fator ficam na unidade de compra.
          </CardContent>
        </Card>
      )}
      {dados && dados.itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Fornecedor</th>
                <th className="py-2 pr-3">Apresentação</th>
                <th className="py-2 pr-3">Fator</th>
                <th className="py-2 pr-3">Versão</th>
                <th className="py-2">Confirmado por</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((c) => (
                <tr
                  key={c.chave + c.versao}
                  className={`border-b align-top ${c.vigente ? '' : 'text-muted-foreground'}`}
                >
                  <td className="py-2 pr-3 font-mono">{c.item}</td>
                  <td className="py-2 pr-3">{c.fornecedor ?? 'geral'}</td>
                  <td className="py-2 pr-3">{c.apresentacao}</td>
                  <td className="py-2 pr-3">
                    1 {c.unidade_compra} = {c.fator} {c.unidade_estoque}
                  </td>
                  <td className="py-2 pr-3">
                    {c.versao} {c.vigente && <Badge variant="outline">vigente</Badge>}
                  </td>
                  <td className="py-2">
                    {c.confirmado_por}, {new Date(c.confirmado_em).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Conversoes
