import { useMemo, useState } from 'react'
import { useParams } from 'common'
import { useSaasOrganizationMembersQuery } from 'data/saas/organization-memberships-query'
import { useSaasOrganizationInvitesQuery } from 'data/saas/organization-invites-query'
import { useCreateSaasInviteMutation } from 'data/saas/organization-invite-create-mutation'
import {
  Button,
  Input_Shadcn_,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
} from 'ui'
import { Admonition } from 'ui-patterns/admonition'

export const SaasTeamSettings = () => {
  const { slug } = useParams()
  const [tab, setTab] = useState<'members' | 'invites'>('members')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'developer' | 'viewer'>('developer')

  const { data: members, isPending: membersLoading, error: membersError } =
    useSaasOrganizationMembersQuery({ slug })
  const { data: invites, isPending: invitesLoading, error: invitesError } =
    useSaasOrganizationInvitesQuery({ slug })

  const { mutate: createInvite, isPending: creatingInvite } = useCreateSaasInviteMutation({
    onSuccess: () => {
      setEmail('')
      setTab('invites')
    },
  })

  const activeInvites = useMemo(
    () => (invites ?? []).filter((i) => !i.accepted_at),
    [invites]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button type={tab === 'members' ? 'primary' : 'default'} onClick={() => setTab('members')}>
          Members
        </Button>
        <Button type={tab === 'invites' ? 'primary' : 'default'} onClick={() => setTab('invites')}>
          Invites
        </Button>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-sm text-foreground-lighter">Invite by email</label>
          <Input_Shadcn_
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div className="w-40">
          <label className="text-sm text-foreground-lighter">Role</label>
          <Select_Shadcn_ value={role} onValueChange={(v) => setRole(v as any)}>
            <SelectTrigger_Shadcn_>
              <SelectValue_Shadcn_ />
            </SelectTrigger_Shadcn_>
            <SelectContent_Shadcn_>
              <SelectItem_Shadcn_ value="viewer">Viewer</SelectItem_Shadcn_>
              <SelectItem_Shadcn_ value="developer">Developer</SelectItem_Shadcn_>
              <SelectItem_Shadcn_ value="admin">Admin</SelectItem_Shadcn_>
            </SelectContent_Shadcn_>
          </Select_Shadcn_>
        </div>
        <Button
          type="primary"
          loading={creatingInvite}
          disabled={!slug || !email.trim()}
          onClick={() => createInvite({ slug, email: email.trim(), role })}
        >
          Invite
        </Button>
      </div>

      {tab === 'members' ? (
        <>
          {membersError ? (
            <Admonition type="destructive" title="Failed to load members" description={membersError.message} />
          ) : (
            <div className="border rounded-md">
              <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs text-foreground-lighter border-b">
                <div>User (GoTrue id)</div>
                <div>Role</div>
                <div>Added</div>
              </div>
              {(membersLoading ? [] : members ?? []).map((m) => (
                <div key={m.gotrue_id} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm border-b last:border-b-0">
                  <div className="font-mono truncate">{m.gotrue_id}</div>
                  <div>{m.role}</div>
                  <div className="text-foreground-lighter">{new Date(m.inserted_at).toLocaleString()}</div>
                </div>
              ))}
              {membersLoading && <div className="px-3 py-3 text-sm text-foreground-lighter">Loading…</div>}
              {!membersLoading && (members?.length ?? 0) === 0 && (
                <div className="px-3 py-3 text-sm text-foreground-lighter">No members found.</div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {invitesError ? (
            <Admonition type="destructive" title="Failed to load invites" description={invitesError.message} />
          ) : (
            <div className="border rounded-md">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-foreground-lighter border-b">
                <div>Email</div>
                <div>Role</div>
                <div>Created</div>
                <div>Status</div>
              </div>
              {(invitesLoading ? [] : activeInvites).map((i) => (
                <div key={i.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm border-b last:border-b-0">
                  <div className="truncate">{i.email}</div>
                  <div>{i.role}</div>
                  <div className="text-foreground-lighter">{new Date(i.inserted_at).toLocaleString()}</div>
                  <div className="text-foreground-lighter">Pending</div>
                </div>
              ))}
              {invitesLoading && <div className="px-3 py-3 text-sm text-foreground-lighter">Loading…</div>}
              {!invitesLoading && activeInvites.length === 0 && (
                <div className="px-3 py-3 text-sm text-foreground-lighter">No pending invites.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

