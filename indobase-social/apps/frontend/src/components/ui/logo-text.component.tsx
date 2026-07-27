import React from 'react';

/** Indobase mark + “Indobase Social” wordmark for auth / billing headers. */
export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[12px] text-current">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-hidden
      >
        <path
          fill="none"
          stroke="#F0B429"
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
          d="M12 16.85 L17.35 13.55 L12 10.25 L6.65 13.55 Z"
        />
        <path
          fill="#F0B429"
          stroke="#F0B429"
          strokeWidth="0.35"
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M12 14.35 L15.85 12 L12 9.65 L8.15 12 Z"
        />
      </svg>
      <span className="text-[22px] font-[600] leading-none tracking-[-0.02em]">
        Indobase Social
      </span>
    </div>
  );
};
