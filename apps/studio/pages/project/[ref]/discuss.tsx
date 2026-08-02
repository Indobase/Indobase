import dynamic from 'next/dynamic'

import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

/*
 * Loaded on demand: the transcript pulls in the virtualiser, and no other surface needs it.
 * `loading` is a real skeleton rather than null — a blank frame while a chunk downloads is how the
 * fork's "loading overlay that never dismissed" looked to users.
 */
const Discuss = dynamic(
  () => import('components/interfaces/Discuss').then((m) => ({ default: m.Discuss })),
  { loading: () => <GenericSkeletonLoader className="p-6" /> }
)

const ProjectDiscussPage: NextPageWithLayout = () => {
  return <Discuss />
}

/*
 * `title` and `product` are the props ProjectLayout actually accepts. Sibling ecosystem pages pass
 * `headerTitle`/`customHeaderComponents`, which are not in ProjectLayoutProps and are currently
 * type errors on those files — not copied here on purpose.
 */
ProjectDiscussPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth title="Indobase Discuss" product="Discuss">
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectDiscussPage
