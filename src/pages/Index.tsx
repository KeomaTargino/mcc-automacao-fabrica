import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const Index = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">PCP American Goodies</h1>
      <p className="text-muted-foreground mb-6">
        Painel operacional da Fase 1 — dados reais do Omie e do canal, por área.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Painel diário</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Estoque por item/local/unidade, pedidos oficiais e complementares, com origem, horário
              e pendências de cada bloco.
            </p>
            <Button asChild>
              <Link to="/painel">Abrir painel</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Produtos do Omie com unidade oficial, ativo/inativo e origem do lote. Ficha técnica
              aparece quando o contrato estiver liberado.
            </p>
            <Button asChild variant="outline">
              <Link to="/catalogo">Abrir catálogo</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Index
