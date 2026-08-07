/** Indobase product mark — used as SiteLogo fallback / chrome brand icon. */
export default function IndobaseMark({
  size = 22,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="Indobase"
      className={className}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12 19.25 L18.75 14.75 L12 10.25 L5.25 14.75 Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.75"
        d="M12 16.85 L17.35 13.55 L12 10.25 L6.65 13.55 Z"
      />
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.35"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12 14.35 L15.85 12 L12 9.65 L8.15 12 Z"
      />
    </svg>
  )
}
