import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import { workbenchStore } from '~/lib/stores/workbench';
import { runDeployBuildStep } from '~/lib/deploy/runDeployBuild';
import {
  canQueueIndobaseDeployment,
  publishIndobaseDeployment,
} from '~/lib/indobase/studioApi';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';
import type { ProgressAnnotation } from '~/types/context';
import { TESTER_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';
import { formatBuildFailureOutput } from '~/components/deploy/deployUtils';
import { finalizeCodegen } from '~/lib/indobase/finalizeCodegen';
import { validateGeneratedProjectContract } from '~/lib/indobase/generation-contract';
import { extractRelativePath } from '~/utils/diff';

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

  const withCi = (command: string) => `export CI=true && ${command}`;

  const testScript = scripts.test;

  if (testScript && !/no test specified/i.test(testScript)) {
    // Force non-watch runners so the Tester agent cannot hang on vitest/jest interactive mode.
    return withCi('npm run test -- --run --watch=false --watchAll=false --passWithNoTests');
  }

  if (scripts['test:ci']) {
    return withCi('npm run test:ci');
  }

  if (scripts['test:unit']) {
    return withCi('npm run test:unit -- --run --watch=false --watchAll=false --passWithNoTests');
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

function collectWorkbenchSourceFiles(): Record<string, string> {
  const sourceFiles: Record<string, string> = {};

  for (const [filePath, dirent] of Object.entries(workbenchStore.files.get())) {
    if (dirent?.type !== 'file' || dirent.isBinary) {
      continue;
    }

    const relativePath = extractRelativePath(filePath);

    if (relativePath && !relativePath.startsWith('node_modules/')) {
      sourceFiles[relativePath] = dirent.content;
    }
  }

  return sourceFiles;
}

/** Autonomous tests should fail fast instead of hanging the Tester progress UI. */
const AUTONOMOUS_SHELL_TIMEOUT_MS = 180_000;

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
      exitTimeoutMs: AUTONOMOUS_SHELL_TIMEOUT_MS,
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
  connection: IndobaseConnectionState;
  onProgress?: (progress: ProgressAnnotation) => void;
  progressOrderStart?: number;
}): Promise<AutonomousPipelineResult> {
  const { connection, onProgress, progressOrderStart = 100 } = options;
  let order = progressOrderStart;
  let testerOpen = false;
  let deployerOpen = false;

  const markTesterComplete = (message: string) => {
    if (!testerOpen) {
      return;
    }

    testerOpen = false;
    onProgress?.(createProgress('tester', 'complete', order++, message));
  };

  const markDeployerComplete = (message: string) => {
    if (!deployerOpen) {
      return;
    }

    deployerOpen = false;
    onProgress?.(createProgress('deployer', 'complete', order++, message));
  };

  try {
    await finalizeCodegen();

    let packageJson: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      packageJson = await readPackageJson();

      if (packageJson) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      await workbenchStore.flushPendingActions();
    }

    testerOpen = true;
    onProgress?.(
      createProgress('tester', 'in-progress', order++, 'Tester agent verifying build and tests'),
    );

    if (!packageJson) {
      markTesterComplete('Build verification failed');

      return {
        success: false,
        needsRepair: true,
        verificationCommand: 'npm run build',
        verificationOutput: 'Missing package.json in the project root.',
        repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`npm run build\`

Output:
Missing package.json in /home/project. Create package.json with a "build" script (Vite + React for SPAs, or a static HTML build that copies *.html into dist/), write all source files using boltAction filePath attributes, then run npm install and npm run build.`,
      };
    }

    const contract = validateGeneratedProjectContract(collectWorkbenchSourceFiles());

    if (!contract.valid) {
      const output = contract.issues.join('\n');
      markTesterComplete('Project setup needs repair');

      return {
        success: false,
        needsRepair: true,
        verificationCommand: 'project runtime contract',
        verificationOutput: output,
        repairPrompt: `${TESTER_REPAIR_USER_PREFIX}Builder rejected the generated ${contract.target} project before build because its runtime contract is incomplete.

${output}

Repair the existing project in the repository root. Write complete file contents using boltAction file actions. Keep the current product work, add the missing runtime files/scripts, then run npm install and npm run build.`,
      };
    }

    const buildResult = await runDeployBuildStep(connection);
    const resolvedBuild = buildResult;

    if (!resolvedBuild.success) {
      markTesterComplete('Build verification failed');

      return {
        success: false,
        needsRepair: true,
        verificationCommand: 'npm run build',
        verificationOutput: resolvedBuild.error || buildResult.error || 'Build failed',
        repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`npm run build\`

Output:
${formatBuildFailureOutput(resolvedBuild.error || buildResult.error) || 'Build failed'}`,
      };
    }

    const testCommand = resolveTestCommand(packageJson);

    if (testCommand) {
      const testResult = await runWorkbenchShell(testCommand);

      if (testResult.exitCode !== 0) {
        markTesterComplete('Automated tests failed');

        return {
          success: false,
          needsRepair: true,
          verificationCommand: testCommand,
          verificationOutput: testResult.output,
          repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`${testCommand}\`

Output:
${formatBuildFailureOutput(testResult.output)}`,
        };
      }
    }

    markTesterComplete('Verification passed');

    if (!canQueueIndobaseDeployment(connection)) {
      return {
        success: true,
        needsRepair: false,
      };
    }

    deployerOpen = true;
    onProgress?.(
      createProgress('deployer', 'in-progress', order++, 'Deployer agent publishing to Indobase'),
    );

    const deployResult = await publishIndobaseDeployment(connection, {
      artifacts: resolvedBuild.files,
      metadata: {
        source: 'autonomous_agents',
      },
    });

    if (deployResult.success && deployResult.deployment?.target_url) {
      markDeployerComplete('Deployment published');

      return {
        success: true,
        needsRepair: false,
        deployUrl: deployResult.deployment.target_url,
      };
    }

    markDeployerComplete('Deployment queued or requires Studio');

    return {
      success: true,
      needsRepair: false,
      deployUrl: deployResult.deployment?.target_url,
    };
  } catch (error) {
    markTesterComplete('Verification interrupted');
    markDeployerComplete('Deploy interrupted');

    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      needsRepair: true,
      verificationCommand: 'npm run build',
      verificationOutput: message,
      repairPrompt: `${TESTER_REPAIR_USER_PREFIX}\`npm run build\`

Output:
${formatBuildFailureOutput(message)}`,
    };
  } finally {
    markTesterComplete('Verification finished');
    markDeployerComplete('Deploy finished');
  }
}
