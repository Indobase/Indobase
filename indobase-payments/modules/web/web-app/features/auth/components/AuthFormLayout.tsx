import { Outlet, useLocation } from 'react-router-dom'

export const AuthFormLayout = () => {
  const location = useLocation()
  const isLogin = location.pathname === '/login'
  const title = isLogin ? 'Sign in' : 'Sign up'

  return (
    <>
      <div className="font-medium text-xl -mb-0.5">{title}</div>
      <div className="text-muted-foreground text-[13px] mb-3 leading-[18px]">
        {isLogin
          ? 'Use your Indobase Studio account to open Indobase Payments.'
          : 'Create your Indobase account in Studio, then open Payments from your project.'}
      </div>
      <Outlet />
    </>
  )
}
