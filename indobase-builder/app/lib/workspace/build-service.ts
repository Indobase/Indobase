import { createScopedLogger } from '~/utils/logger';
import { createBuildId, type BuildId, type SnapshotId } from './ids';
import type { WorkspaceBuild } from './types';
import type { WorkspaceEventBus } from './events';
import { workspaceService } from './workspace-service';

const logger = createScopedLogger('BuildService');

/**
 * Build aggregate: Snapshot → Build → Preview | Deployment.
 * Owns build history; does not mutate project files.
 */
export class BuildService {
  readonly #builds = new Map<BuildId, WorkspaceBuild>();
  readonly #bySnapshot = new Map<SnapshotId, BuildId[]>();

  constructor(private readonly events: WorkspaceEventBus = workspaceService.events) {}

  getBuild(id: BuildId): WorkspaceBuild | undefined {
    return this.#builds.get(id);
  }

  listBuildsForSnapshot(snapshotId: SnapshotId): WorkspaceBuild[] {
    const ids = this.#bySnapshot.get(snapshotId) ?? [];

    return ids
      .map((id) => this.#builds.get(id))
      .filter((build): build is WorkspaceBuild => Boolean(build))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  latestBuildForSnapshot(snapshotId: SnapshotId): WorkspaceBuild | undefined {
    const builds = this.listBuildsForSnapshot(snapshotId);

    return builds.at(-1);
  }

  startBuild(snapshotId: SnapshotId): BuildId {
    const id = createBuildId();
    const build: WorkspaceBuild = {
      id,
      snapshotId,
      status: 'running',
      createdAt: Date.now(),
    };

    this.#builds.set(id, build);
    const list = this.#bySnapshot.get(snapshotId) ?? [];
    list.push(id);
    this.#bySnapshot.set(snapshotId, list);

    logger.debug(`Build ${id} started for snapshot ${snapshotId}`);
    this.events.emit({ type: 'BuildStarted', buildId: id, snapshotId, at: build.createdAt });

    return id;
  }

  finishBuild(
    buildId: BuildId,
    result: { status: 'succeeded'; outputRef?: string } | { status: 'failed'; error: string },
  ): WorkspaceBuild | undefined {
    const build = this.#builds.get(buildId);

    if (!build) {
      return undefined;
    }

    build.finishedAt = Date.now();
    build.status = result.status;

    if (result.status === 'succeeded') {
      build.outputRef = result.outputRef;
    } else {
      build.error = result.error;
    }

    this.events.emit({
      type: 'BuildFinished',
      buildId,
      snapshotId: build.snapshotId,
      status: result.status,
      outputRef: result.status === 'succeeded' ? result.outputRef : undefined,
      error: result.status === 'failed' ? result.error : undefined,
      at: build.finishedAt,
    });

    return build;
  }

  reset(): void {
    this.#builds.clear();
    this.#bySnapshot.clear();
  }
}

export const buildService = new BuildService();
