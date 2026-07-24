import { RouteObject } from 'react-router-dom'

import { AuthFormLayout } from '@/features/auth/components/AuthFormLayout'
import { AuthLayout } from '@/features/auth/components/AuthLayout'
import { AnonymousRoutes } from '@/features/auth/sessionRoutes'
import {
  CheckInbox,
  CheckInboxPassword,
  ForgotPassword,
  Login,
  Registration,
  ResetPassword,
  ValidateEmail,
} from '@/pages/auth'
import { Launch } from '@/pages/auth/launch'
import { OauthSuccess } from '@/pages/auth/oauth-success'

export const anonymousRoutes: RouteObject = {
  element: <AnonymousRoutes />,
  children: [
    {
      path: '/launch',
      element: <Launch />,
      handle: { title: 'Connecting…' },
    },
    {
      element: <AuthLayout />,
      children: [
        {
          element: <AuthFormLayout />,
          children: [
            {
              path: '/login',
              element: <Login />,
              handle: { title: 'Studio sign-in' },
            },
            {
              path: '/registration',
              element: <Registration />,
              handle: { title: 'Studio sign-in' },
            },
          ],
        },
        {
          path: '/check-inbox',
          element: <CheckInbox />,
          handle: { title: 'Studio sign-in' },
        },
        {
          path: '/validate-email',
          element: <ValidateEmail />,
          handle: { title: 'Studio sign-in' },
        },
        {
          path: '/forgot-password',
          element: <ForgotPassword />,
          handle: { title: 'Studio sign-in' },
        },
        {
          path: '/check-inbox-password',
          element: <CheckInboxPassword />,
          handle: { title: 'Studio sign-in' },
        },
        {
          path: '/reset-password',
          element: <ResetPassword />,
          handle: { title: 'Studio sign-in' },
        },
        {
          path: '/oauth_success',
          element: <OauthSuccess />,
          handle: { title: 'Sign in' },
        },
      ],
    },
  ],
}
