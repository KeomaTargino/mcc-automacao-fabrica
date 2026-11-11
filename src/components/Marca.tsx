// Marca provisória (SPEC-4-002): selo marrom com o nome em letra cursiva, nas cores do logo recebido
// (marrom, creme e laranja). Troca pelo arquivo do logo quando chegar em SVG ou PNG de pelo menos 512 px.
export default function Marca({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Mr. Cheney cookies">
      <rect width="100" height="100" rx="14" fill="#4F260C" />
      <text
        x="50"
        y="46"
        textAnchor="middle"
        fontFamily="'Brush Script MT', 'Segoe Script', cursive"
        fontSize="30"
        fill="#F6E7C9"
      >
        Mr. Cheney
      </text>
      <path
        d="M18 56 Q50 66 82 52"
        stroke="#F07D18"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="50"
        y="82"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="14"
        letterSpacing="1"
        fill="#F6E7C9"
      >
        cookies
      </text>
    </svg>
  )
}
