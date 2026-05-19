import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from 'ui'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'

type AdminDeleteButtonProps = {
  label: string
  entityName: string
  description: string
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function AdminDeleteButton({
  label,
  entityName,
  description,
  loading = false,
  onConfirm,
}: AdminDeleteButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        size="tiny"
        icon={<Trash2 />}
        loading={loading}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <ConfirmationModal
        visible={open}
        variant="destructive"
        title={`Delete ${entityName}?`}
        confirmLabel="Delete"
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          await onConfirm()
          setOpen(false)
        }}
        alert={{
          title: 'This action is permanent',
          description,
        }}
      >
        <p className="text-sm text-foreground-light">
          Are you sure you want to permanently delete <span className="text-foreground">{entityName}</span>?
        </p>
        <p className="text-sm text-foreground-light mt-3">
          For <span className="text-foreground">platform operator</span> project/org deletes, Studio
          attempts a <span className="text-foreground">full teardown</span> when configured: the
          data-plane provisioner stops the tenant compose stack and removes Traefik routing, and
          dedicated tenant Postgres databases are dropped using the same{' '}
          <code className="text-code-inline">POSTGRES_*</code> credentials as provisioning. Set{' '}
          <code className="text-code-inline">PLATFORM_ADMIN_PROJECT_DELETE_TEARDOWN=false</code> on
          Studio to delete control-plane rows only. External buckets, DNS outside Traefik, and
          backups may still need manual cleanup.
        </p>
      </ConfirmationModal>
    </>
  )
}
