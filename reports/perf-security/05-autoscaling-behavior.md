# 05) Autoscaling Behavior

Generated: 2026-05-06  
Deployment: Dokploy on Hostinger VPS (typically single-node Docker)

## Goal
Verify how the system behaves under load when resources saturate:
- does anything autoscale?
- how are thresholds handled (disk/CPU/memory)?
- what’s the failure mode?

## What exists in this codebase
### Disk autoscale (UI/config plumbing)
- UI fields + API calls exist for disk autoscale settings:
  - `apps/studio/components/interfaces/DiskManagement/fields/AutoScaleFields.tsx`
  - `apps/studio/data/config/disk-autoscale-config-update-mutation.ts`

## Gaps / caveats
- On a VPS Docker deployment, **autoscaling is not automatic** unless you add:
  - multiple VPS nodes / swarm/k8s
  - external managed DB storage scaling
- Disk autoscale here looks like **configuration**, but the actuator (cloud provider resize, etc.) is not in this repo.

## Recommended test methodology (Dokploy/VPS)
1) Establish baseline CPU/mem/disk.
2) Drive load (k6) until:
   - CPU saturates
   - memory pressure occurs
   - disk approaches threshold
3) Observe:
   - container OOM kills
   - request error rates
   - latency degradation
4) Validate any “autoscale” actions you have configured actually take effect.

## What to capture in the report
- Host resources (CPU/RAM/disk)
- docker stats / cgroup limits per service
- Traefik/Kong behavior under saturation
- any Dokploy scaling/restart policies

## Findings (current state)
- **No compute autoscaling** implementation found in-repo (no HPA/KEDA/cluster manifests).
- Expect **degradation and failures** under sustained load unless you add multi-node infra or scaling policies.

