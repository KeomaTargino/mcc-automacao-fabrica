import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Seletor do kit (SPEC-4-005): lista de opções; valor vazio mostra o texto de orientação.
export interface OpcaoEscolha {
  valor: string
  rotulo: string
}

export default function Escolha({
  value,
  onChange,
  opcoes,
  placeholder = 'Escolha',
  disabled,
  rotuloAria,
  id,
  className = 'w-full',
}: {
  value: string
  onChange: (v: string) => void
  opcoes: OpcaoEscolha[]
  placeholder?: string
  disabled?: boolean
  rotuloAria?: string
  id?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={rotuloAria} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
