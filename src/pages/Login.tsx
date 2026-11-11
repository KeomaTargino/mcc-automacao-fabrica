import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Marca from '@/components/Marca'

const Login = () => {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await signIn(email, senha)
    setEnviando(false)
    if (error) {
      setErro('E-mail ou senha incorretos. Confira e tente de novo.')
      return
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex flex-col items-center gap-2">
          <Marca className="h-28 w-44" />
          <p className="text-center text-2xl font-semibold">PCP American Goodies</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Entrar no sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground" data-subtitulo>
              Use o seu e-mail e a senha que você recebeu.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4" aria-label="Formulário de login">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </div>
              {erro && (
                <p className="text-sm text-destructive" role="alert">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
