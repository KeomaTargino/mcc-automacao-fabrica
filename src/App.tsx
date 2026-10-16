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
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import ProtectedArea from './components/ProtectedArea'
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
                <ProtectedArea area="conferir_expedicao">
                  <Conferencias />
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
