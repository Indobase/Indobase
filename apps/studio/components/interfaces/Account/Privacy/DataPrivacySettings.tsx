import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  INDOBASE_DPDP_GRIEVANCE_ACK_DAYS,
  INDOBASE_DPDP_GRIEVANCE_EMAIL,
  INDOBASE_DPDP_GRIEVANCE_OFFICER_NAME,
  INDOBASE_DPDP_GRIEVANCE_RESOLVE_DAYS,
  INDOBASE_DPDP_NOTICE_URL,
  INDOBASE_DPDP_POLICY_URL,
  INDOBASE_DPDP_CONTROL_PLANE_RETENTION_DAYS,
} from 'common'
import { AccountDeletion } from 'components/interfaces/Account/Preferences/AccountDeletion'
import { AnalyticsSettings } from 'components/interfaces/Account/Preferences/AnalyticsSettings'
import {
  useCreateDataPrincipalRequestMutation,
  useDataPrincipalRequestsQuery,
  usePersonalDataExportMutation,
} from 'data/profile/data-principal-query'
import { useIsFeatureEnabled } from 'hooks/misc/useIsFeatureEnabled'
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from 'ui'
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'

export const DataPrivacySettings = () => {
  const { profileShowAnalyticsAndMarketing, profileShowAccountDeletion } = useIsFeatureEnabled([
    'profile:show_analytics_and_marketing',
    'profile:show_account_deletion',
  ])

  const { data: requests = [], isLoading: requestsLoading } = useDataPrincipalRequestsQuery()
  const [correctionMessage, setCorrectionMessage] = useState('')
  const [grievanceMessage, setGrievanceMessage] = useState('')

  const { mutate: exportData, isPending: isExporting } = usePersonalDataExportMutation({
    onSuccess: () => toast.success('Personal data export downloaded'),
    onError: (error) => toast.error(error.message),
  })

  const { mutate: submitGrievance, isPending: isSubmittingGrievance } =
    useCreateDataPrincipalRequestMutation({
      onSuccess: () => {
        setGrievanceMessage('')
        toast.success('Grievance submitted. We will respond within the statutory timeline.')
      },
      onError: (error) => toast.error(error.message),
    })

  const { mutate: requestCorrection, isPending: isRequestingCorrection } =
    useCreateDataPrincipalRequestMutation({
      onSuccess: () => {
        setCorrectionMessage('')
        toast.success('Correction request recorded')
      },
      onError: (error) => toast.error(error.message),
    })

  return (
    <>
      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Your data under DPDP</PageSectionTitle>
            <PageSectionDescription>
              Indobase processes your account data as a Data Fiduciary under India&apos;s Digital
              Personal Data Protection Act, 2023. Application data in your projects remains under
              your control.
            </PageSectionDescription>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 text-sm text-foreground-light">
              <p>
                Read our{' '}
                <Link href={INDOBASE_DPDP_POLICY_URL} className="underline text-foreground">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link href={INDOBASE_DPDP_NOTICE_URL} className="underline text-foreground">
                  DPDP notice
                </Link>{' '}
                for lawful purposes, retention, and cross-border transfers.
              </p>
              <p>
                <span className="text-foreground">Grievance Officer:</span>{' '}
                {INDOBASE_DPDP_GRIEVANCE_OFFICER_NAME} —{' '}
                <a
                  href={`mailto:${INDOBASE_DPDP_GRIEVANCE_EMAIL}`}
                  className="underline text-foreground"
                >
                  {INDOBASE_DPDP_GRIEVANCE_EMAIL}
                </a>
                . We aim to acknowledge grievances within {INDOBASE_DPDP_GRIEVANCE_ACK_DAYS} days
                and resolve them within {INDOBASE_DPDP_GRIEVANCE_RESOLVE_DAYS} days where feasible.
              </p>
            </CardContent>
          </Card>
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Access your data</PageSectionTitle>
            <PageSectionDescription>
              Download a machine-readable export of control-plane personal data we hold about your
              account (profile, memberships, project metadata, consent records). Secrets and
              customer database contents are excluded.
            </PageSectionDescription>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <Button loading={isExporting} onClick={() => exportData()}>
            Download my data (JSON)
          </Button>
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Correct your data</PageSectionTitle>
            <PageSectionDescription>
              Update your name and email under Account → Preferences. For other corrections, submit
              a request and we will verify your identity before making changes.
            </PageSectionDescription>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent className="flex flex-col gap-3">
          <Textarea
            placeholder="Describe the inaccurate personal data and the correction required…"
            value={correctionMessage}
            onChange={(e) => setCorrectionMessage(e.target.value)}
            rows={3}
          />
          <Button
            type="outline"
            loading={isRequestingCorrection}
            disabled={correctionMessage.trim().length < 10}
            onClick={() =>
              requestCorrection({
                request_type: 'correction',
                message: correctionMessage.trim(),
              })
            }
          >
            Request correction
          </Button>
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Grievance redressal</PageSectionTitle>
            <PageSectionDescription>
              Raise a complaint about how we process your personal data. You may also email the
              Grievance Officer directly.
            </PageSectionDescription>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent className="flex flex-col gap-3">
          <p className="text-sm text-foreground-light">
            Email:{' '}
            <a href={`mailto:${INDOBASE_DPDP_GRIEVANCE_EMAIL}`} className="underline text-foreground">
              {INDOBASE_DPDP_GRIEVANCE_EMAIL}
            </a>
          </p>
          <Textarea
            placeholder="Describe your grievance about our processing of your personal data…"
            value={grievanceMessage}
            onChange={(e) => setGrievanceMessage(e.target.value)}
            rows={3}
          />
          <Button
            type="default"
            loading={isSubmittingGrievance}
            disabled={grievanceMessage.trim().length < 10}
            onClick={() =>
              submitGrievance({ request_type: 'grievance', message: grievanceMessage.trim() })
            }
          >
            Submit grievance
          </Button>
        </PageSectionContent>
      </PageSection>

      {profileShowAnalyticsAndMarketing ? <AnalyticsSettings /> : null}

      {profileShowAccountDeletion ? (
        <>
          <PageSection>
            <PageSectionMeta>
              <PageSectionSummary>
                <PageSectionTitle>Erasure</PageSectionTitle>
                <PageSectionDescription>
                  You may request deletion of your Indobase account. Control-plane metadata is
                  removed within {INDOBASE_DPDP_CONTROL_PLANE_RETENTION_DAYS} days after processing,
                  subject to legal retention obligations (billing, security logs).
                </PageSectionDescription>
              </PageSectionSummary>
            </PageSectionMeta>
          </PageSection>
          <AccountDeletion />
        </>
      ) : null}

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Your requests</PageSectionTitle>
            <PageSectionDescription>Status of data-principal requests you submitted.</PageSectionDescription>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}>Loading…</TableCell>
                    </TableRow>
                  ) : requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-foreground-light">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.request_type}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </PageSectionContent>
      </PageSection>
    </>
  )
}
