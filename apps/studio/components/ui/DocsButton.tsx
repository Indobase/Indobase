import { BookOpen } from 'lucide-react'
import { resolveStudioDocsHref } from 'lib/docs-url'
import { Button } from 'ui'

interface DocsButtonProps {
  href: string
  abbrev?: boolean
  className?: string
}

export const DocsButton = ({ href, abbrev = true, className }: DocsButtonProps) => {
  const resolvedHref = resolveStudioDocsHref(href)
  return (
    <Button
      asChild
      type="default"
      className={className}
      icon={<BookOpen />}
      onClick={(e) => e.stopPropagation()}
    >
      <a target="_blank" rel="noopener noreferrer" href={resolvedHref}>
        {abbrev ? 'Docs' : 'Documentation'}
      </a>
    </Button>
  )
}
