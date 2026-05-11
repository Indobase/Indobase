import { fireEvent, screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { ProjectContextProvider } from 'components/layouts/ProjectLayout/ProjectContext'
import { mockAnimationsApi } from 'jsdom-testing-mocks'
import { customRender } from 'tests/lib/custom-render'
import { routerMock } from 'tests/lib/route-mock'
import type { VaultSecret } from 'types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EditSecretModal } from '../EditSecretModal'

const secret: VaultSecret = {
  id: '47ca58b4-01c5-4a71-8814-c73856b02e0e',
  name: 'test',
  description: 'new text',
  secret: 'NASR0SoksURJ0OorMJ9FzraTzcqSWk5u1PQa2r4c3w9rUVc=',
  created_at: '2025-07-13 12:57:47.62208+00',
  updated_at: '2025-07-13 14:51:37.818223+00',
}

mockAnimationsApi()

vi.mock('hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({
    data: {
      cloud_provider: 'localhost',
      id: 1,
      inserted_at: '2021-08-02T06:40:40.646Z',
      name: 'Default Project',
      organization_id: 1,
      ref: 'abcdefghijklmnopqrst',
      region: 'local',
      status: 'ACTIVE_HEALTHY',
    },
  }),
}))

vi.mock('@/data/vault/vault-secrets-query', () => ({
  useVaultSecretsQuery: () => ({ data: [secret], isSuccess: true }),
}))

vi.mock('data/vault/vault-secret-decrypted-value-query', () => ({
  useVaultSecretDecryptedValueQuery: () => ({ data: 'bar', isPending: false }),
}))

vi.mock('data/vault/vault-secret-update-mutation', () => ({
  useVaultSecretUpdateMutation: () => ({
    isPending: false,
    mutate: (_vars: any, opts: any) => {
      opts?.onSuccess?.()
    },
  }),
}))

describe(`EditSecretModal`, () => {
  beforeEach(() => {
    // useSelectedProjectQuery -> useParams
    routerMock.setCurrentUrl(`/project/abcdefghijklmnopqrst/integrations/vault/secrets`)
  })

  it(
    `renders a modal pre-filled with the secret's values`,
    async () => {
    customRender(
      <ProjectContextProvider projectRef="abcdefghijklmnopqrst">
        <EditSecretModal />
      </ProjectContextProvider>,
      {
        nuqs: {
          searchParams: {
            edit: secret.id,
          },
        },
      }
    )

    await screen.findByRole(`dialog`)

    const nameInput = screen.getByLabelText(`Name`)
    const descriptionInput = screen.getByLabelText(`Description`)
    const valueInput = screen.getByLabelText(`Secret value`)
    const togglePasswordButton = screen.getByRole(`button`, { name: `Show secret value` })
    const submitButton = screen.getByRole(`button`, { name: `Update secret` })

    await waitFor(
      () => {
      expect(nameInput).toHaveValue(secret.name)
      expect(descriptionInput).toHaveValue(secret.description)
      },
      { timeout: 10000 }
    )
    expect(valueInput).toHaveAttribute(`type`, `password`)
    await userEvent.click(togglePasswordButton)
    expect(valueInput).toHaveAttribute(`type`, `text`)

    await userEvent.type(nameInput, `updated-name`)
    await userEvent.clear(descriptionInput)
    await userEvent.type(valueInput, `qux`)

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByRole(`dialog`)).not.toBeInTheDocument()
    })
    },
    15000
  )
})
