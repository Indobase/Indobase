import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { collectBuildArtifacts } from '~/lib/indobase/collectBuildArtifacts';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
} from '~/lib/indobase/studioApi';
import type { SupabaseConnectionState } from '~/lib/stores/supabase';
import type { ProgressAnnotation } from '~/types/context';
import { TESTER_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';

export type AutonomousPipelineResult = {
  deployUrl?: string;
  needsRepair: boolean;
  repairPrompt?: string;
  success: boolean;
  verificationCommand?: string;
  verificationOutput?: string;
};

export function resolveTestCommand(packageJson: Record<string, unknown>): string | null {
  const scripts = packageJson.scripts as Record<string, string> | undefined;

  if (!scripts) {
    return null;
  }

  const testScript = scripts.test;

  if (testScript && !/no test specified/i.test(testScript)) {
    return 'npm run test -- --passWithNoTests';
  }

  if (scripts['test:ci']) {
    return 'npm run test:ci';
  }

  if (scripts['test:unit']) {
    return 'npm run test:unit';
  }

  return null;
}

export async function readPackageJson(): Promise<Record<string, unknown> | null> {
  try {
    const container = await webcontainer;
    const raw = await container.fs.readFile('package.json', 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runWorkbenchShell(command: string): Promise<{ exitCode: number; output: string }> {
  const artifact = workbenchStore.firstArtifact;

  if (!artifact) {
    return { exitCode: 1, output: 'No active project found' };
  }

  const actionId = `autonomous-shell-${Date.now()}`;
  const actionData: ActionCallbackData = {
    messageId: 'autonomous-runner',
    artifactId: artifact.id,
    actionId,
    action: {
      type: 'shell',
      content: command,
    },
  };

  artifact.runner.lastShellOutput = undefined;
  artifact.runner.addAction(actionData);
  await artifact.runner.runAction(actionData);

  const shellOutput = artifact.runner.lastShellOutput;

  if (shellOutput) {
    return shellOutput;
  }

  const action = artifact.runner.actions.get()[actionId];

  if (action?.status === 'failed') {
    return {
      exitCode: 1,
      output: 'error' in action ? action.error : 'Shell command failed',
    };
  }

  return { exitCode: 0, output: '' };
}

function createProgress(
  label: string,
  status: ProgressAnnotation['status'],
  order: number,
  message: string,
): ProgressAnnotation {
  return { type: 'progress', label, status, order, message };
}

export async function runAutonomousPipeline(options: {
  connection: SupabaseConnectionState;
  onProgress?: (progress: ProgressAnnotation) => void;
  progressOrderStart?: number;
}): Promise<AutonomousPipelineResult> {
  const { connection, onProgress, progressOrderStart = 100 } = options;
  let order = progressOrderStart;

  await workbenchStore.waitForExecutionQueue();

  onProgress?.(
    createProgress('tester', 'in-progress', order++, 'Tester agent verifying build and tests'),
  );

  const buildResult = await collectBuildArtifacts();

  if (!buildResult.success) {
    onProgress?.(createProgress('tester', 'complete', order++, 'Build verification failed'));

    return {
      success: false,
      needsRepair: true,
      verificationCommand: 'npm run build',
      verificationOutput: buildResult.error || 'Build failed',
      repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`npm run build\`

Output:
${buildResult.error || 'Build failed'}`,
    };
  }

  const packageJson = await readPackageJson();
  const testCommand = packageJson ? resolveTestCommand(packageJson) : null;

  if (testCommand) {
    const testResult = await runWorkbenchShell(testCommand);

    if (testResult.exitCode !== 0) {
      onProgress?.(createProgress('tester', 'complete', order++, 'Automated tests failed'));

      return {
        success: false,
        needsRepair: true,
        verificationCommand: testCommand,
        verificationOutput: testResult.output,
        repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`${testCommand}\`

Output:
${testResult.output}`,
      };
    }
  }

  onProgress?.(createProgress('tester', 'complete', order++, 'Verification passed'));

  if (!canQueueIndobaseDeployment(connection)) {
    return {
      success: true,
      needsRepair: false,
    };
  }

  onProgress?.(
    createProgress('deployer', 'in-progress', order++, 'Deployer agent publishing to Indobase'),
  );

  const deployResult = await publishIndobaseDeployment(connection, {
    artifacts: buildResult.files,
    metadata: {
      source: 'autonomous_agents',
    },
  });

  if (deployResult.success && deployResult.deployment?.target_url) {
    onProgress?.(createProgress('deployer', 'complete', order++, 'Deployment published'));

    return {
      success: true,
      needsRepair: false,
      deployUrl: deployResult.deployment.target_url,
    };
  }

  onProgress?.(createProgress('deployer', 'complete', order++, 'Deployment queued or requires Studio'));

  return {
    success: true,
    needsRepair: false,
    deployUrl: deployResult.deployment?.target_url,
  };
}
