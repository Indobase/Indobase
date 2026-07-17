import { Button, type ButtonProps } from 'ui'

import { useBuilderLaunch } from './useBuilderLaunch'

type BuilderLaunchButtonProps = Omit<ButtonProps, 'onClick' | 'loading'> & {
  connectFlow?: boolean
  projectRef?: string
  nextPath?: string
}

export const BuilderLaunchButton = ({
  projectRef,
  nextPath,
  connectFlow,
  children,
  ...props
}: BuilderLaunchButtonProps) => {
  const { isLaunching, launch } = useBuilderLaunch({ projectRef, nextPath, connectFlow })

  return (
    <Button {...props} loading={isLaunching} onClick={() => void launch()}>
      {children}
    </Button>
  )
}
