import { ArrowDownNarrowWide, ArrowDownWideNarrow } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from 'ui'

type SortOption = {
  label: string
  value: string
}

interface SortDropdownProps {
  options: SortOption[]
  value: string
  setValue: (value: string) => void
  className?: string
}

export const SortDropdown = ({ options, value, setValue, className }: SortDropdownProps) => {
  const [sortColumn, sortOrder] = value.split('_')
  const columnLabel = options.find((x) => x.value === sortColumn)?.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="default"
          size="tiny"
          className={className}
          icon={sortOrder === 'desc' ? <ArrowDownWideNarrow /> : <ArrowDownNarrowWide />}
        >
          <span className="truncate max-w-[7rem] sm:max-w-none">
            Sorted by {columnLabel ?? sortColumn}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-44" align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
          {options.map((option) => {
            return (
              <DropdownMenuSub key={option.value}>
                <DropdownMenuSubTrigger>Sort by {option.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioItem value={`${option.value}_asc`}>
                    Ascending
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value={`${option.value}_desc`}>
                    Descending
                  </DropdownMenuRadioItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
