import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash } from 'lucide-react'
import { Button, Input_Shadcn_ } from 'ui'

interface EnumeratedTypeValueRowProps {
  index: number
  id: string
  field: any
  isDisabled?: boolean
  onRemoveValue: () => void
}

const EnumeratedTypeValueRow = ({
  index,
  id,
  field,
  isDisabled = false,
  onRemoveValue,
}: EnumeratedTypeValueRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: isDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center space-x-2 space-y-2">
      <button
        type="button"
        className={`opacity-50 hover:opacity-100 transition ${
          isDisabled ? 'text-foreground-lighter !cursor-default' : 'text-foreground cursor-grab active:cursor-grabbing'
        }`}
        disabled={isDisabled}
        aria-label="Drag to reorder value"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} strokeWidth={1.5} />
      </button>
      <Input_Shadcn_ {...field} className="w-full" />
      <Button
        type="default"
        size="small"
        disabled={isDisabled}
        icon={<Trash strokeWidth={1.5} size={16} />}
        className="px-2"
        onClick={() => onRemoveValue()}
      />
    </div>
  )
}

export default EnumeratedTypeValueRow
