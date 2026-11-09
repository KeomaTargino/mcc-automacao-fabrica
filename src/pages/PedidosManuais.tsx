import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import ComoFunciona from '@/components/ComoFunciona'
import { mensagemDeErro, rotuloEstado, textoSeguro } from '@/lib/pcp/textos'
import { criarPedidoManual } from '@/services/pcp-faturamento'

const ESTADO: Record<string, string> = {
  registrado: 'Registrado como pedido manual. Ele segue para a fila em Preparação.',
  a_revisar: 'Possível duplicata: a revisar na Preparação, com motivo.',
  bloqueado_duplicata: 'Duplicata: a mesma referência já existe. Pedido bloqueado.',
}

const PedidosManuais = () => {
  const [cliente, setCliente] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [item, setItem] = useState('')
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ref, setRef] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = () => {
    setMsg(null)
    setErro(null)
    criarPedidoManual({
      cliente_omie: cliente,
      data,
      itens: [{ item, quantidade: Number(qtd) }],
      motivo,
      referencia: ref,
    })
      .then((r) => setMsg(`Pedido ${r.pedido_id}. ${ESTADO[r.estado] ?? rotuloEstado(r.estado)}`))
      .catch((e: any) =>
        setErro(
          e?.status === 403
            ? mensagemDeErro(e)
            : textoSeguro(e?.response?.motivos?.join(' '), 'Não foi possível registrar agora.'),
        ),
      )
  }

  const campo = 'border rounded px-2 py-1 text-sm bg-background w-full'
  return (
    <div className="container mx-auto py-8 px-4 max-w-xl">
      <h1 className="text-3xl font-bold mb-2">Pedidos manuais</h1>
      <p className="text-sm text-muted-foreground mb-3" data-subtitulo>
        Pedidos que chegam por e-mail ou WhatsApp.
      </p>
      <ComoFunciona>
        <p>
          Antes de registrar, o sistema procura o mesmo pedido pela referência. Pedido parecido
          (cliente, data e itens) vai para revisão. Nunca junta por cliente e valor.
        </p>
      </ComoFunciona>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo pedido manual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="block">
            Código do cliente no Omie
            <input
              className={campo}
              value={cliente}
              onChange={(e) => setCliente(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="block">
            Data
            <input
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <label className="block">
            Item (código)
            <input className={campo} value={item} onChange={(e) => setItem(e.target.value)} />
          </label>
          <label className="block">
            Quantidade
            <input
              className={campo}
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
            />
          </label>
          <label className="block">
            Referência (número do pedido do cliente ou do canal, se houver)
            <input className={campo} value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label className="block">
            Por que é manual (e-mail, WhatsApp…)
            <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <Button onClick={enviar} disabled={!cliente || !item || !qtd || !motivo}>
            Registrar pedido manual
          </Button>
          {msg && (
            <p className="text-sm" role="status">
              {msg}{' '}
              <Link to="/pedidos/preparacao" className="underline">
                Ir para a preparação
              </Link>
            </p>
          )}
          {erro && (
            <p className="text-sm text-red-800" role="alert">
              {erro}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PedidosManuais
