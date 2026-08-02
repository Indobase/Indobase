import { useState } from 'react'

import { Button, Input_Shadcn_, Modal, cn } from 'ui'

import { DISCUSS_FOCUS_RING } from './Discuss.constants'

interface CreateChannelDialogProps {
  open: boolean
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { name: string; topic: string; isPrivate: boolean }) => Promise<boolean>
}

export const CreateChannelDialog = ({
  open,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: CreateChannelDialogProps) => {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)

  const reset = () => {
    setName('')
    setTopic('')
    setIsPrivate(false)
  }

  return (
    <Modal
      visible={open}
      onCancel={() => {
        if (isSubmitting) return
        reset()
        onOpenChange(false)
      }}
      header="Create a channel"
      size="small"
      customFooter={
        <div className="flex justify-end gap-2">
          <Button
            type="default"
            disabled={isSubmitting}
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            loading={isSubmitting}
            disabled={name.trim().length === 0}
            onClick={async () => {
              const ok = await onSubmit({ name, topic, isPrivate })
              if (ok) {
                reset()
                onOpenChange(false)
              }
            }}
          >
            Create
          </Button>
        </div>
      }
    >
      <Modal.Content className="space-y-3 py-4">
        <div className="space-y-1.5">
          <label htmlFor="discuss-channel-name" className="text-sm text-foreground">
            Name
          </label>
          <Input_Shadcn_
            id="discuss-channel-name"
            autoFocus
            value={name}
            placeholder="e.g. launches"
            onChange={(event) => setName(event.target.value)}
            className={cn(DISCUSS_FOCUS_RING)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="discuss-channel-topic" className="text-sm text-foreground">
            Topic <span className="text-foreground-lighter">(optional)</span>
          </label>
          <Input_Shadcn_
            id="discuss-channel-topic"
            value={topic}
            placeholder="What is this channel for?"
            onChange={(event) => setTopic(event.target.value)}
            className={cn(DISCUSS_FOCUS_RING)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground-light">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
          />
          Private channel (invite-only)
        </label>
      </Modal.Content>
    </Modal>
  )
}
