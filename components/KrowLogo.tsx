export function KrowLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="1" y="1" width="46" height="46" stroke="currentColor" strokeWidth="2"/>
      <rect x="8" y="8" width="12" height="8" fill="currentColor"/>
      <rect x="8" y="20" width="12" height="8" fill="#fb923c"/>
      <rect x="8" y="32" width="12" height="8" fill="currentColor"/>
      <path d="M20 12H28L36 24L28 36H20" stroke="currentColor" strokeWidth="2"/>
      <path d="M36 24H42" stroke="#fb923c" strokeWidth="3"/>
      <rect x="28" y="20" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
