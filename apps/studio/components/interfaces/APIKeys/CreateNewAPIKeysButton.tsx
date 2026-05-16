import { useState } from 'react'
import { toast } from 'sonner'

import { useParams } from 'common'
import { useAPIKeyCreateMutation } from 'data/api-keys/api-key-create-mutation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from 'ui'

export const CreateNewAPIKeysButton = () => {
  const { ref: projectRef } = useParams()

  const [isCreatingKeys, setIsCreatingKeys] = useState(false)
  const [createKeysDialogOpen, setCreateKeysDialogOpen] = useState(false)

  const { mutateAsync: createAPIKey } = useAPIKeyCreateMutation()

  const handleCreateNewApiKeys = async () => {
    if (!projectRef) return
    setIsCreatingKeys(true)

    try {
      await createAPIKey({ projectRef, type: 'publishable', name: 'web' })
      await createAPIKey({ projectRef, type: 'publishable', name: 'mobile' })
      await createAPIKey({
        projectRef,
        type: 'secret',
        name: 'backend_api',
        description: 'Server-side API access',
      })

      setCreateKeysDialogOpen(false)
      toast.success('Created web, mobile, and backend API keys for your project.')
    } catch (error) {
      console.error('Failed to create API keys:', error)
    } finally {
      setIsCreatingKeys(false)
    }
  }

  return (
    <AlertDialog open={createKeysDialogOpen} onOpenChange={setCreateKeysDialogOpen}>
      <Button onClick={() => setCreateKeysDialogOpen(true)}>Create new API keys</Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create new API keys</AlertDialogTitle>
          <AlertDialogDescription>
            This creates three keys for your project: publishable keys named{' '}
            <code className="!break-keep text-code-inline">web</code> and{' '}
            <code className="!break-keep text-code-inline">mobile</code>, plus a secret key named{' '}
            <code className="!break-keep text-code-inline">backend_api</code> for server-side use.
            Each key is a JWT that works with your project API URL.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleCreateNewApiKeys} disabled={isCreatingKeys}>
            {isCreatingKeys ? 'Creating...' : 'Create keys'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
