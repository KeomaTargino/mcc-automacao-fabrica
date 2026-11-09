import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, textoSeguro } from '@/lib/pcp/textos'
import {
  obterFornecedores,
  salvarFornecedor,
  type ContatoFornecedor,
  type RespostaFornecedores,
} from '@/services/pcp-compras'
import { Skeleton } from '@/components/ui/skeleton'
import Aviso from '@/components/Aviso'

const CONTATO_VAZIO: ContatoFornecedor = { nome: '', funcao: '', telefone: '', email: '' }

const textoDoErro = (e: any): string => {
  const d = e?.response ?? e?.data
  if (Array.isArray(d?.motivos))
    return textoSeguro(d.motivos.join('; '), 'Confira os campos destacados.')
  return e?.status
    ? mensagemDeErro(e)
    : 'Não foi possível salvar agora. Tente de novo em instantes.'
}

const Fornecedores = () => {
  const [dados, setDados] = useState<RespostaFornecedores | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [fornecedor, setFornecedor] = useState('')
  const [prazo, setPrazo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [contatos, setContatos] = useState<ContatoFornecedor[]>([{ ...CONTATO_VAZIO }])

  const carregar = useCallback(() => {
    obterFornecedores()
      .then((r) => {
        setDados(r)
        setErro(null)
      })
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : 'Não foi possível carregar os fornecedores agora. Tente de novo em instantes.',
        ),
      )
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const editar = (i: number, campo: keyof ContatoFornecedor, valor: string) =>
    setContatos(contatos.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)))

  const salvar = async () => {
    setAviso(null)
    try {
      const r = await salvarFornecedor({
        fornecedor,
        contatos: contatos.filter(
          (c) => c.nome.trim() || c.telefone.trim() || c.email.trim() || c.funcao.trim(),
        ),
        prazo_entrega_dias: prazo.trim() === '' ? null : Number(prazo),
        observacao,
      })
      setAviso(`Salvo: versão ${r.versao} do fornecedor ${r.fornecedor}.`)
      setFornecedor('')
      setPrazo('')
      setObservacao('')
      setContatos([{ ...CONTATO_VAZIO }])
      carregar()
    } catch (e: any) {
      setAviso(textoDoErro(e))
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Fornecedores</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Contatos e prazo de entrega de cada fornecedor.
      </p>
      <ComoFunciona>
        <p>
          Cada dado fica no seu campo. O cadastro do Omie não é alterado por esta tela. Cada
          alteração vira uma versão nova, com quem alterou e quando.
        </p>
      </ComoFunciona>
      {erro && (
        <Aviso nivel="bloqueio" topo>
          {erro}
        </Aviso>
      )}
      {!erro && !dados && <Skeleton className="h-24 w-full" aria-label="Carregando" />}
      {dados && (
        <Aviso nivel="atencao">
          {textoSeguro(dados.leitura_omie, 'A lista de fornecedores do Omie ainda não foi lida')}.
          Enquanto isso, o fornecedor é identificado pelo código que vem no pedido de compra.
        </Aviso>
      )}
      {aviso && (
        <div className="mb-4 rounded-md border px-4 py-3 text-sm bg-muted" role="status">
          {aviso}
        </div>
      )}

      {dados?.pode_editar && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Novo complemento (cria uma versão)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-muted-foreground">Código do fornecedor no Omie</span>
              <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground">Prazo de entrega (dias)</span>
              <Input
                type="number"
                min={0}
                max={365}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </label>
            {contatos.map((c, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-3">
                <Input
                  placeholder="Nome"
                  value={c.nome}
                  onChange={(e) => editar(i, 'nome', e.target.value)}
                />
                <Input
                  placeholder="Função"
                  value={c.funcao}
                  onChange={(e) => editar(i, 'funcao', e.target.value)}
                />
                <Input
                  placeholder="Telefone"
                  value={c.telefone}
                  onChange={(e) => editar(i, 'telefone', e.target.value)}
                />
                <Input
                  placeholder="E-mail"
                  value={c.email}
                  onChange={(e) => editar(i, 'email', e.target.value)}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setContatos([...contatos, { ...CONTATO_VAZIO }])}
              >
                Adicionar contato
              </Button>
              <Button size="sm" disabled={!fornecedor.trim()} onClick={salvar}>
                Salvar
              </Button>
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground">Observação</span>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
          </CardContent>
        </Card>
      )}

      {dados && dados.itens.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm">
            Nenhum fornecedor com contatos ou prazo cadastrados ainda.
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {dados?.itens.map((f) => (
          <Card key={f.fornecedor}>
            <CardHeader>
              <CardTitle className="text-base">
                Fornecedor <span className="font-mono">{f.fornecedor}</span>{' '}
                <span className="text-xs text-muted-foreground">versão {f.versao}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                Prazo de entrega:{' '}
                {f.prazo_entrega_dias === null ? 'não informado' : f.prazo_entrega_dias + ' dias'}
              </p>
              {f.contatos.length === 0 && <p className="text-muted-foreground">Sem contatos.</p>}
              <ul className="space-y-1">
                {f.contatos.map((c, i) => (
                  <li key={i}>
                    {c.nome}
                    {c.funcao ? ` — ${c.funcao}` : ''} · {c.telefone || 'sem telefone'} ·{' '}
                    {c.email || 'sem e-mail'}
                  </li>
                ))}
              </ul>
              {f.observacao && <p className="text-xs text-muted-foreground">{f.observacao}</p>}
              <p className="text-xs text-muted-foreground">
                Alterado por {f.alterado_por} em {new Date(f.alterado_em).toLocaleString('pt-BR')}.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Fornecedores
