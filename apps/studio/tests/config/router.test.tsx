import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routerMock } from '../lib/route-mock'
import { afterEach, expect, suite, test, vi } from 'vitest'
import { RouterComponent } from './router'

// Prevent JSDOM navigation errors from Next.js Link by rendering a simple anchor.
// next-router-mock listens to router.push/replace, which our component displays.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: any }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        routerMock.push(href)
      }}
    >
      {children}
    </a>
  ),
}))

suite('Router Mock', () => {
  afterEach(() => {
    routerMock.setCurrentUrl('/')
  })

  test('Router mock works as expected', async () => {
    const comp = render(<RouterComponent />)
    expect(comp.container.textContent).toContain('path: /')
    expect(routerMock.pathname).toBe('/')
  })

  test('Clicking on link changes the path', async () => {
    const comp = render(<RouterComponent />)

    const link = screen.getByRole('link')

    await userEvent.click(link)

    await waitFor(() => {
      expect(routerMock.pathname).toBe('/test')
      expect(comp.container.textContent).toContain('path: /test')
    })
  })

  test('Router mock is reset after each test', async () => {
    const comp = render(<RouterComponent />)
    expect(comp.container.textContent).toContain('path: /')
    expect(routerMock.pathname).toBe('/')
  })
})
