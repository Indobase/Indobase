import React from 'react'
// @ts-ignore
import styles from './loading-anim.module.css'

const LogoLoader = () => (
  <div className="w-full h-full flex flex-col items-center justify-center">
    <div>
      <svg
        width="60"
        height="60"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles['loading']}
      >
        <circle cx="10" cy="16" r="7" fill="#FF9933" />
        <circle cx="24" cy="16" r="4.5" fill="#FF9933" />
      </svg>
    </div>
  </div>
)

export default LogoLoader
