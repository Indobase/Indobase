/**
 * Deterministic org/project → Gameplan Team (community) / Project (space) keys.
 *
 * Must stay in sync with:
 * - `frappe-app/indobase_discuss/indobase_discuss/utils/space_map.py`
 * - `apps/studio/lib/api/saas/discuss-launch-shared.ts`
 *
 * Keys (`teamKey` / `spaceKey`) are slugs: stable, never rewritten.
 * Titles are human labels and must never be an internal key.
 */
const MAX_KEY_LEN = 64;
const INTERNAL_KEY_PREFIX = /^ib-(?:proj|org)-/i;
function cleanSlug(input) {
    return input
        .toLowerCase()
        .split('')
        .filter((c) => /[a-z0-9-]/.test(c))
        .join('')
        .slice(0, MAX_KEY_LEN);
}
function cleanProjectRef(input) {
    return input
        .toLowerCase()
        .split('')
        .filter((c) => /[a-z0-9]/.test(c))
        .join('')
        .slice(0, 40);
}
function titleCase(words) {
    return words
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
/** Turn slug/key-ish input into a human label for sidebar titles. */
export function humanizeTitle(raw, fallback) {
    const collapsed = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!collapsed)
        return fallback;
    const stripped = collapsed.replace(INTERNAL_KEY_PREFIX, '').trim();
    if (!stripped)
        return fallback;
    if (!/\s/.test(stripped) && /[-_]/.test(stripped)) {
        return titleCase(stripped.split(/[-_]+/).join(' ')).slice(0, 64);
    }
    return stripped.slice(0, 64);
}
/** Stable team key for an Indobase organization slug. */
export function discussTeamKeyForOrgSlug(orgSlug) {
    const cleaned = cleanSlug(orgSlug);
    if (!cleaned)
        return 'ib-org-default';
    return `ib-org-${cleaned}`.slice(0, MAX_KEY_LEN);
}
/** Stable space (GP Project) key for an Indobase project ref. */
export function discussSpaceKeyForProjectRef(projectRef) {
    const cleaned = cleanProjectRef(projectRef);
    if (!cleaned)
        return 'ib-proj-default';
    return `ib-proj-${cleaned}`.slice(0, MAX_KEY_LEN);
}
export function buildDiscussSpaceMap(opts) {
    const orgSlug = opts.orgSlug.trim();
    const projectRef = opts.projectRef.trim();
    const teamKey = discussTeamKeyForOrgSlug(orgSlug);
    const spaceKey = discussSpaceKeyForProjectRef(projectRef);
    const teamTitle = humanizeTitle(opts.organizationName || orgSlug, 'Organization');
    const spaceTitle = humanizeTitle(opts.projectName || projectRef, 'Project');
    return {
        orgSlug,
        projectRef,
        teamKey,
        spaceKey,
        teamTitle,
        spaceTitle,
    };
}
/**
 * Preferred Gameplan SPA deep link when we only have deterministic keys.
 * After SSO exchange, prefer Frappe document names from the handoff response
 * (`/g/{team_doc}/{space_doc}`) — keys alone can 404 when names differ.
 */
export function gameplanSpacePath(map) {
    return `/g/${encodeURIComponent(map.teamKey)}/${encodeURIComponent(map.spaceKey)}`;
}
