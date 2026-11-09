// src/pages/TrocarSenha.tsx — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Tela de troca obrigatoria da senha inicial (contas reais da matriz v1.2).
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TrocarSenha = () => {
  const navigate = useNavigate()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    if (nova !== confirma) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }
    if (nova.length < 8) {
      setErro('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    setEnviando(true)
    try {
      await pb.send('/backend/v1/pcp/trocar-senha', {
        method: 'POST',
        body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
      })
      navigate('/')
    } catch (err: any) {
      const msg = String(err?.response?.message || err?.message || '')
      setErro(
        msg === 'senha_atual_incorreta'
          ? 'A senha atual está incorreta.'
          : 'Não foi possível trocar a senha. Tente novamente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Trocar a senha inicial</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground" data-subtitulo>
            Escolha uma senha nova para continuar usando o sistema.
          </p>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-label="Formulário de troca de senha"
          >
            <div className="space-y-2">
              <Label htmlFor="atual">Senha inicial (recebida)</Label>
              <Input
                id="atual"
                type="password"
                autoComplete="current-password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova">Nova senha</Label>
              <Input
                id="nova"
                type="password"
                autoComplete="new-password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirma">Confirmar nova senha</Label>
              <Input
                id="confirma"
                type="password"
                autoComplete="new-password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                required
              />
            </div>
            {erro && (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Trocar senha e entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default TrocarSenha
