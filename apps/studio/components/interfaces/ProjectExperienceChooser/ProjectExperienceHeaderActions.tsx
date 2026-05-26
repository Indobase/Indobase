import Link from 'next/link'

import { useParams } from 'common'
import { Button } from 'ui'

import { BuilderLaunchButton } from './BuilderLaunchButton'

export const ProjectExperienceHeaderActions = () => {
  const { ref } = useParams()

  return (
    <div className="flex items-center gap-2">
      <Button type="default" asChild>
        <Link href={`/project/${ref}`}>Chooser</Link>
      </Button>
      <BuilderLaunchButton type="default">Builder</BuilderLaunchButton>
    </div>
  )
}
