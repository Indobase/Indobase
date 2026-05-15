/**
 * Indobase mark: three stacked isometric tiles (brand collections icon).
 * Uses fixed brand colors so it reads correctly on dark sidebars.
 */
export function IndobaseStackIcon({
  className,
  size = 15,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      {/* Bottom tile — yellow outline */}
      <path
        fill="none"
        stroke="#FFC107"
        strokeWidth={1.35}
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12 19.25 L18.75 14.75 L12 10.25 L5.25 14.75 Z"
      />
      {/* Middle tile — white fill, yellow stroke */}
      <path
        fill="#FFFFFF"
        stroke="#FFC107"
        strokeWidth={1.35}
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12 16.85 L17.35 13.55 L12 10.25 L6.65 13.55 Z"
      />
      {/* Top tile — solid yellow */}
      <path
        fill="#FFC107"
        stroke="#FFC107"
        strokeWidth={0.35}
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12 14.35 L15.85 12 L12 9.65 L8.15 12 Z"
      />
    </svg>
  )
}
