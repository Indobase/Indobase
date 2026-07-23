import { Outlet } from 'react-router-dom'

/** Transient layout while auth routes bounce to Studio. */
export const AuthFormLayout = () => {
  return (
    <>
      <div className="font-medium text-xl -mb-0.5">Indobase Payments</div>
      <div className="text-muted-foreground text-[13px] mb-3 leading-[18px]">
        Opening Studio sign-in…
      </div>
      <Outlet />
    </>
  )
}
