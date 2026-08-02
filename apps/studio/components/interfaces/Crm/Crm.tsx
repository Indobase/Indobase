import { useParams } from 'common'
import {
  Building2,
  CalendarCheck2,
  Contact,
  Home,
  KanbanSquare,
  LineChart,
  UserPlus,
  Workflow,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import {
  useCrmActivitiesQuery,
  useCrmCreateActivityMutation,
  useCrmUpdateActivityMutation,
} from 'data/crm/crm-activities-query'
import { useCrmBootstrapQuery } from 'data/crm/crm-bootstrap-query'
import {
  useCrmCompaniesQuery,
  useCrmCreateCompanyMutation,
} from 'data/crm/crm-companies-query'
import { useCrmConnection } from 'data/crm/crm-connection'
import {
  useCrmContactsQuery,
  useCrmCreateContactMutation,
} from 'data/crm/crm-contacts-query'
import {
  useCrmCreateDealMutation,
  useCrmDealsQuery,
  useCrmUpdateDealStageMutation,
} from 'data/crm/crm-deals-query'
import {
  useCrmConvertLeadMutation,
  useCrmCreateLeadMutation,
  useCrmLeadsQuery,
  useCrmUpdateLeadMutation,
} from 'data/crm/crm-leads-query'
import { useCrmStagesQuery } from 'data/crm/crm-stages-query'
import {
  CRM_LEAD_SOURCES,
  CRM_LEAD_STATUSES,
  type CrmLeadStatus,
} from 'data/crm/crm.types'
import { Button, Input_Shadcn_, cn } from 'ui'

import { ConvertLeadDialog } from './ConvertLeadDialog'
import { CRM_FOCUS_RING, type CrmModule, type CrmSelection } from './Crm.constants'
import { CrmAutomationsPanel, CrmReportsPanel } from './CrmReportsAutomations'
import { PipelineBoard } from './PipelineBoard'
import { RecordActivities } from './RecordActivities'
import { RecordNotes } from './RecordNotes'
import { RecordTags } from './RecordTags'

const MODULES: Array<{ id: CrmModule; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'contacts', label: 'Contacts', icon: Contact },
  { id: 'accounts', label: 'Accounts', icon: Building2 },
  { id: 'deals', label: 'Deals', icon: KanbanSquare },
  { id: 'activities', label: 'Activities', icon: CalendarCheck2 },
  { id: 'reports', label: 'Reports', icon: LineChart },
  { id: 'automations', label: 'Automations', icon: Workflow },
]

function money(amount: number | null | undefined, currency = 'INR') {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount))
  } catch {
    return String(amount)
  }
}

export const Crm = () => {
  const { ref: projectRef } = useParams()
  const { connection } = useCrmConnection({ projectRef })
  const [module, setModule] = useState<CrmModule>('home')
  const [selection, setSelection] = useState<CrmSelection>(null)
  const [query, setQuery] = useState('')
  const [dealsView, setDealsView] = useState<'board' | 'list'>('board')
  const [convertingLead, setConvertingLead] = useState(false)

  const bootstrap = useCrmBootstrapQuery({ projectRef })
  const stagesQuery = useCrmStagesQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.stages }
  )
  const companiesQuery = useCrmCompaniesQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.companies }
  )
  const contactsQuery = useCrmContactsQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.contacts }
  )
  const dealsQuery = useCrmDealsQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.deals }
  )
  const leadsQuery = useCrmLeadsQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.leads }
  )
  const activitiesQuery = useCrmActivitiesQuery(
    { projectRef },
    { enabled: bootstrap.isSuccess, initialData: bootstrap.data?.activities }
  )

  const { mutateAsync: createLead, isPending: creatingLead } = useCrmCreateLeadMutation()
  const { mutateAsync: updateLead } = useCrmUpdateLeadMutation()
  const { mutateAsync: convertLead, isPending: converting } = useCrmConvertLeadMutation()
  const { mutateAsync: createContact, isPending: creatingContact } = useCrmCreateContactMutation()
  const { mutateAsync: createCompany, isPending: creatingCompany } = useCrmCreateCompanyMutation()
  const { mutateAsync: createDeal, isPending: creatingDeal } = useCrmCreateDealMutation()
  const { mutate: moveDeal } = useCrmUpdateDealStageMutation()
  const { mutateAsync: createActivity, isPending: creatingActivity } =
    useCrmCreateActivityMutation()
  const { mutate: updateActivity } = useCrmUpdateActivityMutation()

  const canWrite = bootstrap.data?.role !== 'viewer'
  const memberId = bootstrap.data?.memberId
  const stages = stagesQuery.data ?? []
  const companies = companiesQuery.data ?? []
  const contacts = contactsQuery.data ?? []
  const deals = dealsQuery.data ?? []
  const leads = leadsQuery.data ?? []
  const activities = activitiesQuery.data ?? []

  const term = query.trim().toLowerCase()
  const filteredLeads = useMemo(
    () =>
      leads.filter((row) => {
        if (!term) return true
        return [row.full_name, row.email, row.company_name, row.status]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      }),
    [leads, term]
  )
  const filteredContacts = useMemo(
    () =>
      contacts.filter((row) => {
        if (!term) return true
        return [row.full_name, row.email, row.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      }),
    [contacts, term]
  )
  const filteredCompanies = useMemo(
    () =>
      companies.filter((row) => {
        if (!term) return true
        return [row.name, row.industry, row.city]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      }),
    [companies, term]
  )
  const filteredDeals = useMemo(
    () =>
      deals.filter((row) => {
        if (!term) return true
        return row.title.toLowerCase().includes(term)
      }),
    [deals, term]
  )

  const openLeads = leads.filter((l) => l.status !== 'Converted').length
  const openDeals = deals.filter((d) => {
    const stage = stages.find((s) => s.id === d.stage_id)
    return stage && !stage.is_won && !stage.is_lost
  }).length
  const pipelineValue = deals.reduce((sum, d) => {
    const stage = stages.find((s) => s.id === d.stage_id)
    if (!stage || stage.is_lost) return sum
    return sum + (Number(d.amount) || 0)
  }, 0)

  const selectedLead =
    selection?.module === 'lead' ? leads.find((l) => l.id === selection.id) : undefined
  const selectedContact =
    selection?.module === 'contact' ? contacts.find((c) => c.id === selection.id) : undefined
  const selectedCompany =
    selection?.module === 'company' ? companies.find((c) => c.id === selection.id) : undefined
  const selectedDeal =
    selection?.module === 'deal' ? deals.find((d) => d.id === selection.id) : undefined

  if (!projectRef) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-light">
        No project selected
      </div>
    )
  }

  if (bootstrap.isPending) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-foreground-light">
        Opening CRM…
      </div>
    )
  }

  if (bootstrap.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-destructive-600">Failed to open CRM: {bootstrap.error.message}</p>
        <Button type="default" onClick={() => void bootstrap.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const switchModule = (next: CrmModule) => {
    setModule(next)
    setSelection(null)
    setQuery('')
    setConvertingLead(false)
  }

  const recordExtras = (relatedModule: 'lead' | 'contact' | 'company' | 'deal', relatedId: string) => (
    <>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-light">
          Tags
        </h3>
        <RecordTags
          projectRef={projectRef}
          relatedModule={relatedModule}
          relatedId={relatedId}
          canWrite={canWrite}
        />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-light">
          Activities
        </h3>
        <RecordActivities
          projectRef={projectRef}
          relatedModule={relatedModule}
          relatedId={relatedId}
          activities={activities}
          memberId={memberId}
          canWrite={canWrite}
        />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-light">
          Notes
        </h3>
        <RecordNotes
          projectRef={projectRef}
          relatedModule={relatedModule}
          relatedId={relatedId}
          memberId={memberId}
          canWrite={canWrite}
        />
      </div>
    </>
  )

  return (
    <div className="flex h-full min-h-0 w-full">
      <nav
        aria-label="CRM modules"
        className="flex w-44 shrink-0 flex-col gap-0.5 border-r bg-surface-100 p-2"
      >
        <p className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-foreground-light">
          CRM
        </p>
        {MODULES.map((item) => {
          const Icon = item.icon
          const active = module === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => switchModule(item.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                CRM_FOCUS_RING,
                active
                  ? 'bg-surface-300 text-foreground'
                  : 'text-foreground-light hover:bg-surface-200 hover:text-foreground'
              )}
            >
              <Icon size={14} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {module === 'home' ? (
          <div className="space-y-4 p-6">
            <div>
              <h1 className="text-lg font-medium text-foreground">Sales home</h1>
              <p className="text-sm text-foreground-light">
                Pipeline snapshot for this project — modules on the left.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Open leads', value: String(openLeads), go: 'leads' as CrmModule },
                { label: 'Contacts', value: String(contacts.length), go: 'contacts' as CrmModule },
                { label: 'Open deals', value: String(openDeals), go: 'deals' as CrmModule },
                {
                  label: 'Pipeline value',
                  value: money(pipelineValue),
                  go: 'deals' as CrmModule,
                },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => switchModule(card.go)}
                  className={cn(
                    'rounded-md border bg-surface-100 px-4 py-3 text-left hover:bg-surface-200',
                    CRM_FOCUS_RING
                  )}
                >
                  <p className="text-xs uppercase tracking-wide text-foreground-lighter">
                    {card.label}
                  </p>
                  <p className="mt-1 text-xl font-medium text-foreground">{card.value}</p>
                </button>
              ))}
            </div>
            <div className="rounded-md border">
              <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground-light">
                Upcoming activities
              </div>
              <ul className="divide-y">
                {activities.slice(0, 8).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-sm text-foreground">{row.subject}</p>
                      <p className="text-xs text-foreground-lighter">
                        {row.kind} · {row.status}
                      </p>
                    </div>
                    {canWrite ? (
                      <select
                        className={cn('rounded border px-2 py-1 text-xs', CRM_FOCUS_RING)}
                        value={row.status}
                        onChange={(e) =>
                          updateActivity({
                            ...connection,
                            activityId: row.id,
                            status: e.target.value as typeof row.status,
                          })
                        }
                      >
                        {['Not Started', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))}
                {activities.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-foreground-light">
                    No activities yet — create tasks, calls, or meetings from Activities.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}

        {module === 'leads' ? (
          <ModuleSplit
            title="Leads"
            search={query}
            onSearch={setQuery}
            list={
              <>
                {canWrite ? (
                  <LeadCreateForm
                    loading={creatingLead}
                    onCreate={async (values) => {
                      try {
                        const lead = await createLead({
                          ...connection,
                          ...values,
                          createdBy: memberId,
                        })
                        setSelection({ module: 'lead', id: lead.id })
                        return true
                      } catch {
                        return false
                      }
                    }}
                  />
                ) : null}
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b bg-surface-100 text-xs uppercase text-foreground-lighter">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={cn(
                          'cursor-pointer border-b hover:bg-surface-100',
                          selection?.module === 'lead' &&
                            selection.id === lead.id &&
                            'bg-surface-200'
                        )}
                        onClick={() => {
                          setConvertingLead(false)
                          setSelection({ module: 'lead', id: lead.id })
                        }}
                      >
                        <td className="px-3 py-2">{lead.full_name}</td>
                        <td className="px-3 py-2 text-foreground-light">
                          {lead.company_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-foreground-light">{lead.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            }
            detail={
              selectedLead ? (
                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-medium">{selectedLead.full_name}</h2>
                      <p className="text-sm text-foreground-light">
                        {selectedLead.email ?? 'No email'} · {selectedLead.phone ?? 'No phone'}
                      </p>
                    </div>
                    {canWrite && selectedLead.status !== 'Converted' ? (
                      <Button
                        type="primary"
                        size="tiny"
                        onClick={() => setConvertingLead(true)}
                      >
                        Convert lead
                      </Button>
                    ) : null}
                  </div>
                  {convertingLead && selectedLead.status !== 'Converted' ? (
                    <ConvertLeadDialog
                      leadName={selectedLead.full_name}
                      stages={stages}
                      loading={converting}
                      onCancel={() => setConvertingLead(false)}
                      onConvert={async ({ dealTitle, stageId, amount }) => {
                        const result = await convertLead({
                          ...connection,
                          leadId: selectedLead.id,
                          dealTitle,
                          stageId,
                          amount,
                        })
                        setConvertingLead(false)
                        if (result.deal_id) {
                          setModule('deals')
                          setDealsView('list')
                          setSelection({ module: 'deal', id: result.deal_id })
                        } else if (result.contact_id) {
                          setModule('contacts')
                          setSelection({ module: 'contact', id: result.contact_id })
                        }
                      }}
                    />
                  ) : null}
                  <FieldGrid
                    fields={[
                      ['Status', selectedLead.status],
                      ['Company', selectedLead.company_name],
                      ['Title', selectedLead.title],
                      ['Source', selectedLead.lead_source],
                      ['Description', selectedLead.description],
                    ]}
                  />
                  {canWrite && selectedLead.status !== 'Converted' ? (
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-foreground-light">Change status</span>
                      <select
                        className={cn('w-full rounded border px-2 py-1.5', CRM_FOCUS_RING)}
                        value={selectedLead.status}
                        onChange={(e) =>
                          void updateLead({
                            ...connection,
                            leadId: selectedLead.id,
                            patch: { status: e.target.value as CrmLeadStatus },
                          })
                        }
                      >
                        {CRM_LEAD_STATUSES.filter((s) => s !== 'Converted').map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {recordExtras('lead', selectedLead.id)}
                </div>
              ) : (
                <EmptyDetail label="Select a lead" />
              )
            }
          />
        ) : null}

        {module === 'contacts' ? (
          <ModuleSplit
            title="Contacts"
            search={query}
            onSearch={setQuery}
            list={
              <>
                {canWrite ? (
                  <QuickCreate
                    placeholder="Full name"
                    loading={creatingContact}
                    onSubmit={async (name) => {
                      try {
                        const row = await createContact({
                          ...connection,
                          fullName: name,
                          createdBy: memberId,
                        })
                        setSelection({ module: 'contact', id: row.id })
                        return true
                      } catch {
                        return false
                      }
                    }}
                  />
                ) : null}
                <SimpleTable
                  headers={['Name', 'Email', 'Phone']}
                  rows={filteredContacts.map((c) => [
                    c.id,
                    c.full_name,
                    c.email ?? '—',
                    c.phone ?? '—',
                  ])}
                  selectedId={selection?.module === 'contact' ? selection.id : null}
                  onSelect={(id) => setSelection({ module: 'contact', id })}
                />
              </>
            }
            detail={
              selectedContact ? (
                <div className="space-y-4 p-4">
                  <h2 className="text-base font-medium">{selectedContact.full_name}</h2>
                  <FieldGrid
                    fields={[
                      ['Email', selectedContact.email],
                      ['Phone', selectedContact.phone],
                      ['Title', selectedContact.title],
                      ['Source', selectedContact.lead_source],
                      [
                        'Account',
                        companies.find((c) => c.id === selectedContact.company_id)?.name,
                      ],
                    ]}
                  />
                  {recordExtras('contact', selectedContact.id)}
                </div>
              ) : (
                <EmptyDetail label="Select a contact" />
              )
            }
          />
        ) : null}

        {module === 'accounts' ? (
          <ModuleSplit
            title="Accounts"
            search={query}
            onSearch={setQuery}
            list={
              <>
                {canWrite ? (
                  <QuickCreate
                    placeholder="Account name"
                    loading={creatingCompany}
                    onSubmit={async (name) => {
                      try {
                        const row = await createCompany({
                          ...connection,
                          name,
                          createdBy: memberId,
                        })
                        setSelection({ module: 'company', id: row.id })
                        return true
                      } catch {
                        return false
                      }
                    }}
                  />
                ) : null}
                <SimpleTable
                  headers={['Account', 'Industry', 'City']}
                  rows={filteredCompanies.map((c) => [
                    c.id,
                    c.name,
                    c.industry ?? '—',
                    c.city ?? '—',
                  ])}
                  selectedId={selection?.module === 'company' ? selection.id : null}
                  onSelect={(id) => setSelection({ module: 'company', id })}
                />
              </>
            }
            detail={
              selectedCompany ? (
                <div className="space-y-4 p-4">
                  <h2 className="text-base font-medium">{selectedCompany.name}</h2>
                  <FieldGrid
                    fields={[
                      ['Website', selectedCompany.website],
                      ['Phone', selectedCompany.phone],
                      ['Industry', selectedCompany.industry],
                      ['City', selectedCompany.city],
                      ['Description', selectedCompany.description],
                    ]}
                  />
                  {recordExtras('company', selectedCompany.id)}
                </div>
              ) : (
                <EmptyDetail label="Select an account" />
              )
            }
          />
        ) : null}

        {module === 'deals' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <h1 className="flex-1 text-sm font-medium">Deals</h1>
              <Button
                type={dealsView === 'board' ? 'primary' : 'default'}
                size="tiny"
                onClick={() => setDealsView('board')}
              >
                Board
              </Button>
              <Button
                type={dealsView === 'list' ? 'primary' : 'default'}
                size="tiny"
                onClick={() => setDealsView('list')}
              >
                List
              </Button>
            </div>
            {dealsView === 'board' ? (
              <PipelineBoard
                stages={stages}
                deals={deals}
                companies={companies}
                canWrite={canWrite}
                isCreating={creatingDeal}
                onSelectDeal={(id) => {
                  setDealsView('list')
                  setSelection({ module: 'deal', id })
                }}
                onCreateDeal={async ({ title, stageId, amount }) => {
                  try {
                    await createDeal({
                      ...connection,
                      title,
                      stageId,
                      amount,
                      createdBy: memberId,
                    })
                    return true
                  } catch {
                    return false
                  }
                }}
                onMoveDeal={(dealId, stageId) => moveDeal({ ...connection, dealId, stageId })}
              />
            ) : (
              <ModuleSplit
                title=""
                search={query}
                onSearch={setQuery}
                hideHeader
                list={
                  <SimpleTable
                    headers={['Deal', 'Amount', 'Stage']}
                    rows={filteredDeals.map((d) => [
                      d.id,
                      d.title,
                      money(d.amount, d.currency),
                      stages.find((s) => s.id === d.stage_id)?.name ?? '—',
                    ])}
                    selectedId={selection?.module === 'deal' ? selection.id : null}
                    onSelect={(id) => setSelection({ module: 'deal', id })}
                  />
                }
                detail={
                  selectedDeal ? (
                    <div className="space-y-4 p-4">
                      <h2 className="text-base font-medium">{selectedDeal.title}</h2>
                      <FieldGrid
                        fields={[
                          ['Amount', money(selectedDeal.amount, selectedDeal.currency)],
                          [
                            'Stage',
                            stages.find((s) => s.id === selectedDeal.stage_id)?.name,
                          ],
                          ['Probability', selectedDeal.probability?.toString()],
                          ['Closing', selectedDeal.closing_date],
                          ['Source', selectedDeal.lead_source],
                          [
                            'Account',
                            companies.find((c) => c.id === selectedDeal.company_id)?.name,
                          ],
                        ]}
                      />
                      {recordExtras('deal', selectedDeal.id)}
                    </div>
                  ) : (
                    <EmptyDetail label="Select a deal" />
                  )
                }
              />
            )}
          </div>
        ) : null}

        {module === 'activities' ? (
          <div className="flex h-full min-h-0 flex-col">
            {canWrite ? (
              <ActivityCreateForm
                loading={creatingActivity}
                onCreate={async (values) => {
                  try {
                    await createActivity({
                      ...connection,
                      ...values,
                      createdBy: memberId,
                    })
                    return true
                  } catch {
                    return false
                  }
                }}
              />
            ) : null}
            <ul className="min-h-0 flex-1 divide-y overflow-auto">
              {activities.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.subject}</p>
                    <p className="text-xs text-foreground-lighter">
                      {row.kind} · {row.status}
                      {row.due_at ? ` · due ${new Date(row.due_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  {canWrite ? (
                    <select
                      className={cn('rounded border px-2 py-1 text-xs', CRM_FOCUS_RING)}
                      value={row.status}
                      onChange={(e) =>
                        updateActivity({
                          ...connection,
                          activityId: row.id,
                          status: e.target.value as typeof row.status,
                        })
                      }
                    >
                      {['Not Started', 'In Progress', 'Completed', 'Cancelled'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              ))}
              {activities.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-foreground-light">
                  No activities yet
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {module === 'reports' ? <CrmReportsPanel projectRef={projectRef} /> : null}

        {module === 'automations' ? (
          <CrmAutomationsPanel
            projectRef={projectRef}
            stages={stages}
            memberId={memberId}
            canWrite={canWrite}
          />
        ) : null}
      </div>
    </div>
  )
}

function ModuleSplit({
  title,
  search,
  onSearch,
  list,
  detail,
  hideHeader,
}: {
  title: string
  search: string
  onSearch: (value: string) => void
  list: ReactNode
  detail: ReactNode
  hideHeader?: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[42%] min-w-[280px] max-w-md shrink-0 flex-col border-r">
        {!hideHeader ? (
          <div className="space-y-2 border-b px-3 py-3">
            <h1 className="text-sm font-medium">{title}</h1>
            <Input_Shadcn_
              value={search}
              placeholder={`Search ${title.toLowerCase()}…`}
              onChange={(e) => onSearch(e.target.value)}
              className={CRM_FOCUS_RING}
            />
          </div>
        ) : (
          <div className="border-b px-3 py-2">
            <Input_Shadcn_
              value={search}
              placeholder="Search deals…"
              onChange={(e) => onSearch(e.target.value)}
              className={CRM_FOCUS_RING}
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">{list}</div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto bg-background">{detail}</div>
    </div>
  )
}

function EmptyDetail({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-foreground-lighter">
      {label}
    </div>
  )
}

function FieldGrid({ fields }: { fields: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="rounded-md border px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-foreground-lighter">{label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">{value?.trim() ? value : '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function SimpleTable({
  headers,
  rows,
  selectedId,
  onSelect,
}: {
  headers: string[]
  rows: string[][]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 border-b bg-surface-100 text-xs uppercase text-foreground-lighter">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-3 py-8 text-center text-foreground-light">
              No records
            </td>
          </tr>
        ) : (
          rows.map(([id, ...cols]) => (
            <tr
              key={id}
              className={cn(
                'cursor-pointer border-b hover:bg-surface-100',
                selectedId === id && 'bg-surface-200'
              )}
              onClick={() => onSelect(id!)}
            >
              {cols.map((col, index) => (
                <td key={`${id}-${index}`} className="px-3 py-2">
                  {col}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function QuickCreate({
  placeholder,
  loading,
  onSubmit,
}: {
  placeholder: string
  loading: boolean
  onSubmit: (value: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  return (
    <form
      className="flex gap-2 border-b px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit(value).then((ok) => ok && setValue(''))
      }}
    >
      <Input_Shadcn_
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className={cn('flex-1', CRM_FOCUS_RING)}
      />
      <Button type="primary" size="tiny" htmlType="submit" loading={loading} disabled={!value.trim()}>
        Add
      </Button>
    </form>
  )
}

function LeadCreateForm({
  loading,
  onCreate,
}: {
  loading: boolean
  onCreate: (values: {
    fullName: string
    email?: string | null
    phone?: string | null
    companyName?: string | null
    leadSource?: string | null
  }) => Promise<boolean>
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [leadSource, setLeadSource] = useState('')
  return (
    <form
      className="grid grid-cols-2 gap-2 border-b px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        void onCreate({
          fullName,
          email: email || null,
          companyName: companyName || null,
          leadSource: leadSource || null,
        }).then((ok) => {
          if (ok) {
            setFullName('')
            setEmail('')
            setCompanyName('')
            setLeadSource('')
          }
        })
      }}
    >
      <Input_Shadcn_
        value={fullName}
        placeholder="Lead name *"
        onChange={(e) => setFullName(e.target.value)}
        className={CRM_FOCUS_RING}
      />
      <Input_Shadcn_
        value={email}
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
        className={CRM_FOCUS_RING}
      />
      <Input_Shadcn_
        value={companyName}
        placeholder="Company"
        onChange={(e) => setCompanyName(e.target.value)}
        className={CRM_FOCUS_RING}
      />
      <select
        value={leadSource}
        onChange={(e) => setLeadSource(e.target.value)}
        className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
      >
        <option value="">Lead source</option>
        {CRM_LEAD_SOURCES.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
      <Button
        type="primary"
        size="tiny"
        htmlType="submit"
        className="col-span-2"
        loading={loading}
        disabled={!fullName.trim()}
      >
        Create lead
      </Button>
    </form>
  )
}

function ActivityCreateForm({
  loading,
  onCreate,
}: {
  loading: boolean
  onCreate: (values: {
    kind: 'task' | 'call' | 'meeting'
    subject: string
    dueAt?: string | null
  }) => Promise<boolean>
}) {
  const [kind, setKind] = useState<'task' | 'call' | 'meeting'>('task')
  const [subject, setSubject] = useState('')
  const [dueAt, setDueAt] = useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        void onCreate({
          kind,
          subject,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }).then((ok) => {
          if (ok) {
            setSubject('')
            setDueAt('')
          }
        })
      }}
    >
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className={cn('h-9 rounded-md border bg-background px-2 text-sm', CRM_FOCUS_RING)}
      >
        <option value="task">Task</option>
        <option value="call">Call</option>
        <option value="meeting">Meeting</option>
      </select>
      <Input_Shadcn_
        value={subject}
        placeholder="Subject"
        onChange={(e) => setSubject(e.target.value)}
        className={cn('min-w-[12rem] flex-1', CRM_FOCUS_RING)}
      />
      <Input_Shadcn_
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        className={CRM_FOCUS_RING}
      />
      <Button type="primary" htmlType="submit" loading={loading} disabled={!subject.trim()}>
        Add
      </Button>
    </form>
  )
}
