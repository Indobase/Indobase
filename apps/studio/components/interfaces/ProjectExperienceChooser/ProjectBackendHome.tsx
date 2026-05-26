import { IS_SAAS } from 'common'
import { Home } from 'components/interfaces/Home/Home'
import { HomeV2 } from 'components/interfaces/HomeNew/Home'
import { useTrackExperimentExposure } from 'hooks/misc/useTrackExperimentExposure'
import { usePHFlag } from 'hooks/ui/useFlag'

export const ProjectBackendHome = () => {
  const homeNewVariant = usePHFlag<string>('homeNew')
  const isHomeNew = homeNewVariant === 'new-home'

  useTrackExperimentExposure(
    'home_new',
    IS_SAAS && typeof homeNewVariant !== 'boolean' ? homeNewVariant : undefined
  )

  if (isHomeNew) {
    return <HomeV2 />
  }

  return <Home />
}
