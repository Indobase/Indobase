import AlertError from 'components/ui/AlertError'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'components/ui/DataTable/Table'
import { usePlatformAdminOrganizationDeleteMutation } from 'data/platform-admin/platform-admin-delete-mutation'
import { usePlatformAdminOrganizationPatchMutation } from 'data/platform-admin/platform-admin-mutations'
import { usePlatformAdminOrganizationDetailQuery } from 'data/platform-admin/platform-admin-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Badge, Button } from 'ui'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import { Admonition } from 'ui-patterns/admonition'
import { Input } from 'ui-patterns/DataInputs/Input'
import { AdminDeleteButton } from './AdminDeleteButton'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function readSupportNote(restrictionData: unknown): string {
  if (!restrictionData || typeof restrictionData !== 'object') return ''
  const ps = (restrictionData as Record<string, unknown>).platform_support
  if (!ps || typeof ps !== 'object') return ''
  return String((ps as Record<string, unknown>).note ?? '')
}

export const PlatformAdminOrganizationDetail = () => {
  const router = useRouter()
  const slug = typeof router.query.slug === 'string' ? router.query.slug : ''
  const { data, isPending, isError, error } = usePlatformAdminOrganizationDetailQuery(slug, {
    enabled: router.isReady && Boolean(slug),
  })
  const { mutateAsync: deleteOrg, isPending: isDeleting } =
    usePlatformAdminOrganizationDeleteMutation()
  const { mutateAsync: patchOrg, isPending: isPatching } =
    usePlatformAdminOrganizationPatchMutation()

  const [plan, setPlan] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [stripeCustomerId, setStripeCustomerId] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [usageBilling, setUsageBilling] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [supportNote, setSupportNote] = useState('')
  const [transferTo, setTransferTo] = useState('')

  useEffect(() => {
    if (!data?.organization) return
    const o = data.organization
    setPlan(o.plan)
    setBillingEmail(o.billing_email ?? '')
    setStripeCustomerId(o.stripe_customer_id ?? '')
    setSubscriptionId(o.subscription_id ?? '')
    setUsageBilling(o.usage_billing_enabled)
    setSupportNote(readSupportNote(o.restriction_data))
    setTransferTo('')
    setSuspendReason('')
  }, [data?.organization?.updated_at, data?.organization?.id])

  if (!router.isReady || !slug) return <GenericSkeletonLoader />
  if (isPending) return <GenericSkeletonLoader />
  if (isError) return <AlertError error={error} subject="organization" />
  if (!data) {
    return (
      <PageContainer className="py-6">
        <p className="text-sm text-foreground-light">Organization not found.</p>
        <Button type="default" className="mt-4" asChild>
          <Link href="/platform-admin/organizations">Back to list</Link>
        </Button>
      </PageContainer>
    )
  }

  const { organization: o, members, projects } = data
  const isSuspended = o.restriction_status === 'platform_suspended'

  return (
    <PageContainer className="py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="default" size="tiny" icon={<ArrowLeft />} asChild>
          <Link href="/platform-admin/organizations">Back to list</Link>
        </Button>
        <Button type="default" size="tiny" icon={<ExternalLink />} asChild>
          <Link href={`/org/${o.slug}`}>Open tenant org</Link>
        </Button>
        <AdminDeleteButton
          label="Delete organization"
          entityName={o.name}
          description="Removes this organization, its projects, members, invites, and other linked control-plane rows in Studio’s database."
          loading={isDeleting}
          onConfirm={async () => {
            await deleteOrg({ slug: o.slug })
            await router.push('/platform-admin/organizations')
          }}
        />
      </div>

      <PageHeader>
        <PageHeaderSummary>
          <PageHeaderTitle>{o.name}</PageHeaderTitle>
          <PageHeaderDescription>
            <span className="font-mono text-code-inline">{o.slug}</span> · Plan{' '}
            <span className="font-medium">{o.plan}</span>
            {isSuspended && (
              <Badge variant="warning" className="ml-2">
                Platform suspended
              </Badge>
            )}
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeader>

      {isSuspended && (
        <Admonition
          type="warning"
          title="Organization suspended by platform"
          description="Tenants may be blocked from creating resources depending on your product checks. Use Unsuspend when the issue is resolved."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border rounded-md p-4 space-y-3">
          <h3 className="text-sm font-medium">Billing & subscription</h3>
          <p className="text-xs text-foreground-light">
            Writes billing fields on the control plane. Stripe/Razorpay consoles remain the source
            of truth for payment state.
          </p>
          <div className="space-y-2">
            <label className="text-xs text-foreground-light">Plan</label>
            <Input size="tiny" className="font-mono" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-foreground-light">Billing email</label>
            <Input size="tiny" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-foreground-light">Stripe customer id</label>
            <Input
              size="tiny"
              className="font-mono text-xs"
              value={stripeCustomerId}
              onChange={(e) => setStripeCustomerId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-foreground-light">Subscription id</label>
            <Input
              size="tiny"
              className="font-mono text-xs"
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usageBilling}
              onChange={(e) => setUsageBilling(e.target.checked)}
            />
            Usage billing enabled
          </label>
          <Button
            type="primary"
            size="tiny"
            loading={isPatching}
            onClick={() =>
              patchOrg({
                slug: o.slug,
                patch: {
                  billing: {
                    plan,
                    billing_email: billingEmail,
                    usage_billing_enabled: usageBilling,
                    stripe_customer_id: stripeCustomerId,
                    subscription_id: subscriptionId,
                  },
                },
              })
            }
          >
            Save billing
          </Button>
        </div>

        <div className="border rounded-md p-4 space-y-3">
          <h3 className="text-sm font-medium">Lifecycle & access</h3>
          <div className="space-y-2">
            <label className="text-xs text-foreground-light">Suspend reason (optional)</label>
            <Input size="tiny" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="danger"
              size="tiny"
              loading={isPatching}
              disabled={isSuspended}
              onClick={() =>
                patchOrg({
                  slug: o.slug,
                  patch: { suspend: { reason: suspendReason } },
                })
              }
            >
              Suspend org
            </Button>
            <Button
              type="default"
              size="tiny"
              loading={isPatching}
              disabled={!isSuspended}
              onClick={() => patchOrg({ slug: o.slug, patch: { unsuspend: true } })}
            >
              Unsuspend org
            </Button>
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <label className="text-xs text-foreground-light">Transfer ownership to member (UUID)</label>
            <Input
              size="tiny"
              className="font-mono text-xs"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              placeholder="gotrue_id of existing member"
            />
            <Button
              type="warning"
              size="tiny"
              loading={isPatching}
              disabled={!transferTo.trim()}
              onClick={() =>
                patchOrg({
                  slug: o.slug,
                  patch: { transfer_owner_gotrue_id: transferTo.trim() },
                })
              }
            >
              Transfer owner
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-md p-4 space-y-3">
        <h3 className="text-sm font-medium">Internal support note</h3>
        <p className="text-xs text-foreground-light">
          Stored in organization <code className="text-code-inline">restriction_data.platform_support</code>{' '}
          (operator-visible; not shown to tenants unless your app reads it).
        </p>
        <textarea
          className="w-full min-h-[100px] rounded-md border border-border bg-background text-sm p-2"
          value={supportNote}
          onChange={(e) => setSupportNote(e.target.value)}
        />
        <Button
          type="primary"
          size="tiny"
          loading={isPatching}
          onClick={() =>
            patchOrg({
              slug: o.slug,
              patch: { support_note: supportNote },
            })
          }
        >
          Save support note
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-border p-4 space-y-1 text-sm">
          <p className="text-foreground-light">Billing partner</p>
          <p>{o.billing_partner ?? '—'}</p>
        </div>
        <div className="rounded-md border border-border p-4 space-y-1 text-sm">
          <p className="text-foreground-light">Owner (GoTrue id)</p>
          <p className="font-mono text-xs break-all">{o.owner_gotrue_id}</p>
        </div>
        <div className="rounded-md border border-border p-4 space-y-1 text-sm">
          <p className="text-foreground-light">Created</p>
          <p>{formatDate(o.created_at)}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Members ({members.length})</h3>
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>User id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.gotrue_id}>
                  <TableCell>{m.primary_email ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{m.username ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="default">{m.role}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground-light max-w-[140px] truncate">
                    {m.gotrue_id}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Projects ({projects.length})</h3>
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provision</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.ref}>
                  <TableCell>
                    <Link href={`/project/${p.ref}`} className="text-brand hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'ACTIVE_HEALTHY' ? 'default' : 'warning'}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.provision_ok === true ? 'OK' : p.provision_ok === false ? 'Failed' : '—'}
                    {p.data_plane_last_provisioned_at && (
                      <span className="text-foreground-light block">
                        {formatDate(p.data_plane_last_provisioned_at)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-foreground-light whitespace-nowrap">
                    {formatDate(p.inserted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageContainer>
  )
}
