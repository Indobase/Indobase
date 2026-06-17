import Link from 'next/link'

import {
  ScaffoldContainer,
  ScaffoldHeader,
  ScaffoldSection,
  ScaffoldTitle,
} from 'components/layouts/Scaffold'
import { DOCS_URL } from 'lib/constants'
import { Admonition } from 'ui-patterns'

export const UsageMeteringUnavailable = () => (
  <>
    <ScaffoldContainer>
      <ScaffoldHeader className="pt-8">
        <ScaffoldTitle>Usage</ScaffoldTitle>
      </ScaffoldHeader>
    </ScaffoldContainer>
    <ScaffoldContainer>
      <ScaffoldSection isFullWidth>
        <Admonition
          type="default"
          title="Usage metering is not available yet"
          description={
            <div className="space-y-2 text-sm">
              <p>
                Organization usage charts appear after Kong access logs are aggregated into{' '}
                <code className="text-code-inline">saas.usage_events</code> via Vector. Until then,
                billing is plan-based (Razorpay) without per-metric dashboards.
              </p>
              <p>
                Operators: apply{' '}
                <code className="text-code-inline">docker/volumes/db/saas-usage-metering.sql</code>{' '}
                and configure the Postgres sink in{' '}
                <code className="text-code-inline">docker/volumes/logs/vector.yml</code>. See{' '}
                <Link href={`${DOCS_URL}/guides/platform/billing-on-indobase`} target="_blank">
                  billing docs
                </Link>{' '}
                and <code className="text-code-inline">docker/PLATFORM-ADMIN-OPS.md</code>.
              </p>
            </div>
          }
        />
      </ScaffoldSection>
    </ScaffoldContainer>
  </>
)
