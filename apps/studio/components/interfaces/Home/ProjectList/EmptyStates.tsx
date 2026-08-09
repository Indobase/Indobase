import { BoxPlus } from 'icons'
import { Plus } from 'lucide-react'
import Link from 'next/link'

import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import { BASE_PATH } from 'lib/constants'
import { getPublicBuilderUrl } from 'lib/constants/builder-url'
import {
  Button,
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'ui'
import { EmptyStatePresentational } from 'ui-patterns'
import { ShimmeringCard } from './ShimmeringCard'

export const Header = () => {
  return (
    <div className="border-default border-b p-3">
      <div className="flex items-center space-x-2">
        <Link href="/organizations">
          <img
            src={`${BASE_PATH}/img/indobase-logo.svg`}
            alt="Indobase"
            className="border-default rounded border p-1 hover:border-white"
            style={{ height: 24 }}
          />
        </Link>
      </div>
    </div>
  )
}

export const LoadingTableView = () => {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Compute</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(3)].map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="bg-surface-400 h-4 w-32"></Skeleton>
              </TableCell>
              <TableCell>
                <Skeleton className="bg-surface-400 h-4 w-16"></Skeleton>
              </TableCell>
              <TableCell>
                <Skeleton className="bg-surface-400 h-4 w-20"></Skeleton>
              </TableCell>
              <TableCell>
                <Skeleton className="bg-surface-400 h-4 w-20"></Skeleton>
              </TableCell>
              <TableCell>
                <Skeleton className="bg-surface-400 h-4 w-24"></Skeleton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export const LoadingCardView = () => {
  return (
    <ul className="w-full mx-auto grid grid-cols-1 gap-4 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      <ShimmeringCard />
      <ShimmeringCard />
    </ul>
  )
}

export const NoProjectsState = ({ slug }: { slug: string }) => {
  const projectCreationEnabled = useIsFeatureEnabled('projects:create')
  const builderUrl = getPublicBuilderUrl()

  return (
    <EmptyStatePresentational
      icon={BoxPlus}
      title="Continue in Builder"
      description="Create and ship your app with Indobase Builder. Studio keeps your org and project data — the agent sets them up for you."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="tiny" type="primary" asChild>
          <a href={builderUrl}>Continue in Builder</a>
        </Button>
        {projectCreationEnabled && (
          <Button size="tiny" type="default" asChild icon={<Plus />}>
            <Link href={`/new/${slug}`}>New project in Studio</Link>
          </Button>
        )}
      </div>
    </EmptyStatePresentational>
  )
}

export const NoOrganizationsState = () => {
  const builderUrl = getPublicBuilderUrl()

  return (
    <EmptyStatePresentational
      title="Continue in Builder"
      description="Start in Indobase Builder — your Free organization and workspace are created when you verify in chat. No Studio onboarding wizard required."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="tiny" type="primary" asChild>
          <a href={builderUrl}>Continue in Builder</a>
        </Button>
        <Button size="tiny" type="default" asChild icon={<Plus />}>
          <Link href="/new">New organization in Studio</Link>
        </Button>
      </div>
    </EmptyStatePresentational>
  )
}
