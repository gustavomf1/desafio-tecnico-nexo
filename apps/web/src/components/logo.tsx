export function NexoMark({ size = 20, color = '#037AF6', fg = '#ffffff' }: { size?: number; color?: string; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill={color} />
      <path d="M7 17V7l10 10V7" stroke={fg} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
