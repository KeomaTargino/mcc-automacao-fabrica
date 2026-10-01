import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const Catalogo = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <div
        className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
      >
        Dados de demonstração — fontes ainda não conectadas.
      </div>

      <h1 className="text-3xl font-bold mb-6">Catálogo</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos (demonstração)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Código</th>
                <th className="pb-2">Descrição</th>
                <th className="pb-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1">P1</td>
                <td>Produto demonstração 1</td>
                <td>UN</td>
              </tr>
              <tr>
                <td className="py-1">P2</td>
                <td>Produto demonstração 2</td>
                <td>KG</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

export default Catalogo
