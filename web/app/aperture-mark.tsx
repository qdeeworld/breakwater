export function ApertureMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="42"
      viewBox="0 0 30 42"
      fill="none"
      aria-hidden="true"
    >
      <path d="M12 3C1 11 1 31 12 39V3Z" fill="currentColor" />
      <path d="M20 0C29 11 29 31 20 42V0Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}
