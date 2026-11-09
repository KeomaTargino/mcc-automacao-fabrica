/* 404 Page - Displays when a user attempts to access a non-existent route - translate to the language of the user */
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Página não encontrada</h1>
        <p className="text-xl text-gray-600 mb-4" data-subtitulo>
          Esta página não existe ou foi movida.
        </p>
        <a href="/" className="text-info hover:text-info underline">
          Voltar ao início
        </a>
      </div>
    </div>
  )
}

export default NotFound
