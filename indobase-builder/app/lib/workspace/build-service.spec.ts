import { describe, expect, it, beforeEach } from 'vitest';
import { BuildService } from './build-service';
import { WorkspaceEventBus } from './events';
import { createSnapshotId } from './ids';

describe('BuildService', () => {
  let events: WorkspaceEventBus;
  let builds: BuildService;

  beforeEach(() => {
    events = new WorkspaceEventBus();
    builds = new BuildService(events);
  });

  it('records build lifecycle for a snapshot', () => {
    const snap = createSnapshotId();
    const emitted: string[] = [];
    events.subscribe((e) => emitted.push(e.type));

    const buildId = builds.startBuild(snap);
    builds.finishBuild(buildId, { status: 'succeeded', outputRef: 'https://preview/' });

    const latest = builds.latestBuildForSnapshot(snap);
    expect(latest?.status).toBe('succeeded');
    expect(latest?.outputRef).toBe('https://preview/');
    expect(emitted).toEqual(['BuildStarted', 'BuildFinished']);
  });
});
