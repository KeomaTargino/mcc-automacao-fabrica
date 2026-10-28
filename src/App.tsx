/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Catalogo from './pages/Catalogo'
import Painel from './pages/Painel'
import Login from './pages/Login'
import TrocarSenha from './pages/TrocarSenha'
import Qualidade from './pages/Qualidade'
import Planejamento from './pages/Planejamento'
import Apontamentos from './pages/Apontamentos'
import Conferencias from './pages/Conferencias'
import Sugestoes from './pages/Sugestoes'
import Consolidacoes from './pages/Consolidacoes'
import EnvioOmie from './pages/EnvioOmie'
import Fornecedores from './pages/Fornecedores'
import Conversoes from './pages/Conversoes'
import HistoricoPrecos from './pages/HistoricoPrecos'
import Requisicoes from './pages/Requisicoes'
import Entregas from './pages/Entregas'
import Recebimentos from './pages/Recebimentos'
import Unidades from './pages/Unidades'
import PedidosPreparacao from './pages/PedidosPreparacao'
import PedidosManuais from './pages/PedidosManuais'
import Parametros from './pages/Parametros'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import ProtectedArea from './components/ProtectedArea'
import { DEMO_CONFERENCIA } from './components/Layout'
import { AuthProvider } from './hooks/use-auth'

// ONLY IMPORT AND RENDER WORKING PAGES, NEVER ADD PLACEHOLDER COMPONENTS OR PAGES IN THIS FILE
// AVOID REMOVING ANY CONTEXT PROVIDERS FROM THIS FILE (e.g. TooltipProvider, Toaster, Sonner)

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/trocar-senha" element={<TrocarSenha />} />
          <Route element={<Layout />}>
            <Route
              path="/"
              element={
                <ProtectedArea area="painel">
                  <Index />
                </ProtectedArea>
              }
            />
            <Route
              path="/catalogo"
              element={
                <ProtectedArea area="catalogo">
                  <Catalogo />
                </ProtectedArea>
              }
            />
            <Route
              path="/painel"
              element={
                <ProtectedArea area="painel">
                  <Painel />
                </ProtectedArea>
              }
            />
            <Route
              path="/qualidade"
              element={
                <ProtectedArea area="painel">
                  <Qualidade />
                </ProtectedArea>
              }
            />
            <Route
              path="/planejamento"
              element={
                <ProtectedArea area="planejamento">
                  <Planejamento />
                </ProtectedArea>
              }
            />
            <Route
              path="/parametros"
              element={
                <ProtectedArea area="planejamento">
                  <Parametros />
                </ProtectedArea>
              }
            />
            <Route
              path="/apontamentos"
              element={
                <ProtectedArea area="apontar_producao">
                  <Apontamentos />
                </ProtectedArea>
              }
            />
            <Route
              path="/conferencias"
              element={
                <ProtectedArea area={DEMO_CONFERENCIA ? 'painel' : 'conferir_expedicao'}>
                  <Conferencias />
                </ProtectedArea>
              }
            />
            <Route
              path="/sugestoes"
              element={
                <ProtectedArea area="painel">
                  <Sugestoes />
                </ProtectedArea>
              }
            />
            <Route
              path="/fornecedores"
              element={
                <ProtectedArea area="compras">
                  <Fornecedores />
                </ProtectedArea>
              }
            />
            <Route
              path="/conversoes"
              element={
                <ProtectedArea area="compras">
                  <Conversoes />
                </ProtectedArea>
              }
            />
            <Route
              path="/compras/requisicoes"
              element={
                <ProtectedArea area="compras">
                  <Requisicoes />
                </ProtectedArea>
              }
            />
            <Route
              path="/unidades"
              element={
                <ProtectedArea area="faturamento">
                  <Unidades />
                </ProtectedArea>
              }
            />
            <Route
              path="/pedidos/preparacao"
              element={
                <ProtectedArea area="faturamento">
                  <PedidosPreparacao />
                </ProtectedArea>
              }
            />
            <Route
              path="/pedidos/manuais"
              element={
                <ProtectedArea area="faturamento">
                  <PedidosManuais />
                </ProtectedArea>
              }
            />
            <Route
              path="/recebimentos"
              element={
                <ProtectedArea area="recebimento">
                  <Recebimentos />
                </ProtectedArea>
              }
            />
            <Route
              path="/compras/entregas"
              element={
                <ProtectedArea area="compras">
                  <Entregas />
                </ProtectedArea>
              }
            />
            <Route
              path="/compras/historico"
              element={
                <ProtectedArea area="compras">
                  <HistoricoPrecos />
                </ProtectedArea>
              }
            />
            <Route
              path="/envio-omie"
              element={
                <ProtectedArea area="painel">
                  <EnvioOmie />
                </ProtectedArea>
              }
            />
            <Route
              path="/consolidacoes"
              element={
                <ProtectedArea area="painel">
                  <Consolidacoes />
                </ProtectedArea>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
