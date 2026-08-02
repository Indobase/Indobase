import dynamic from 'next/dynamic'

import DefaultLayout from 'components/layouts/DefaultLayout'
import { ProjectLayoutWithAuth } from 'components/layouts/ProjectLayout'
import type { NextPageWithLayout } from 'types'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

const Crm = dynamic(
  () => import('components/interfaces/Crm').then((m) => ({ default: m.Crm })),
  { loading: () => <GenericSkeletonLoader className="p-6" /> }
)

const ProjectCrmPage: NextPageWithLayout = () => {
  return <Crm />
}

ProjectCrmPage.getLayout = (page) => (
  <DefaultLayout>
    <ProjectLayoutWithAuth title="Indobase CRM" product="CRM">
      {page}
    </ProjectLayoutWithAuth>
  </DefaultLayout>
)

export default ProjectCrmPage
