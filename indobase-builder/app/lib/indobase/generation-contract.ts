import type { Message } from 'ai';
import type { FileMap } from '~/lib/.server/llm/constants';

export type BuilderProjectTarget = 'web' | 'mobile';

export type GenerationContractValidation = {
  target: BuilderProjectTarget;
  issues: string[];
  valid: boolean;
};

export type OneShotBuildResponseInspection = {
  complete: boolean;
  issues: string[];
};

const MOBILE_INTENT = /\b(?:mobile app|native app|react native|expo|ios|android)\b/i;

type BuildMessage = Pick<Message, 'role' | 'content'>;

function contentFromMessage(message: BuildMessage): string {
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }

  return String(message.content ?? '');
}

function packageUsesExpo(packageJson?: string): boolean {
  if (!packageJson) {
    return false;
  }

  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = { ...parsed.dependencies, ...parsed.devDependencies };

    return Boolean(dependencies.expo || dependencies['expo-router'] || dependencies['@expo/metro-runtime']);
  } catch {
    return /"(?:expo|expo-router|@expo\/metro-runtime)"/.test(packageJson);
  }
}

function fileMapContent(files?: FileMap, fileName?: string): string | undefined {
  if (!files || !fileName) {
    return undefined;
  }

  for (const [path, file] of Object.entries(files)) {
    if (file?.type === 'file' && (path === fileName || path.endsWith(`/${fileName}`))) {
      return file.content;
    }
  }

  return undefined;
}

export function inferBuilderProjectTarget(messages: BuildMessage[], files?: FileMap): BuilderProjectTarget {
  const packageJson = fileMapContent(files, 'package.json');

  if (
    packageUsesExpo(packageJson) ||
    fileMapContent(files, 'app.json') ||
    fileMapContent(files, 'app.config.ts') ||
    fileMapContent(files, 'app.config.js')
  ) {
    return 'mobile';
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  return latestUserMessage && MOBILE_INTENT.test(contentFromMessage(latestUserMessage)) ? 'mobile' : 'web';
}

/**
 * True until the conversation has a real scaffold artifact (file actions). Clarifying-question
 * assistant turns must not disable one-shot install/start enforcement or re-enable MCP tools.
 */
export function isInitialScaffoldTurn(messages: BuildMessage[]): boolean {
  return !messages.some((message) => {
    if (message.role !== 'assistant') {
      return false;
    }

    const content = contentFromMessage(message);

    return /<boltArtifact\b/i.test(content) && /<boltAction\b[^>]*\btype\s*=\s*["']file["']/i.test(content);
  });
}

/** Complex intents that still get a richer (but local, zero-latency) instant plan. */
export const COMPLEX_BUILD_INTENT =
  /\b(?:auth|oauth|login|sign[\s-]?up|payment|stripe|razorpay|checkout|dashboard|saas|admin|multi[\s-]?tenant|realtime|websocket|graphql|postgres|supabase|indobase backend|database|crm|marketplace|e-?commerce|shop|cart|mobile app|react native|expo|ios|android)\b/i;

const SIMPLE_SCAFFOLD_MAX_WORDS = 40;

export function latestUserMessageText(messages: BuildMessage[]): string {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');

  return latestUserMessage ? contentFromMessage(latestUserMessage).trim() : '';
}

export function isComplexBuildIntent(messages: BuildMessage[]): boolean {
  const text = latestUserMessageText(messages);

  return Boolean(text && (COMPLEX_BUILD_INTENT.test(text) || MOBILE_INTENT.test(text)));
}

/**
 * Short, UI-only first Builds — compact contract, minimal files.
 */
export function isSimpleFirstScaffoldTurn(messages: BuildMessage[]): boolean {
  if (!isInitialScaffoldTurn(messages)) {
    return false;
  }

  const text = latestUserMessageText(messages);

  if (!text) {
    return false;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (wordCount === 0 || wordCount > SIMPLE_SCAFFOLD_MAX_WORDS) {
    return false;
  }

  if (isComplexBuildIntent(messages)) {
    return false;
  }

  return true;
}

/**
 * Zero-latency plan injected instead of an LLM planner round (~30–90s).
 * Complex prompts get domain-specific steps; simple prompts get a minimal Vite checklist.
 */
export function getInstantBuildPlan(messages: BuildMessage[]): string {
  const text = latestUserMessageText(messages) || 'the requested app';
  const complex = isComplexBuildIntent(messages);
  const mobile = MOBILE_INTENT.test(text);

  if (mobile) {
    return `## Build steps
1. Scaffold a root-level Expo web app (package.json, app.json, entry)
2. Implement the UI and flows described: ${text.slice(0, 240)}
3. Wire Indobase Auth/DB only if the prompt requires it
4. npm install, then start Expo web for preview`;
  }

  if (complex) {
    const wantsAuth = /\b(?:auth|oauth|login|sign[\s-]?up)\b/i.test(text);
    const wantsPay = /\b(?:payment|stripe|razorpay|checkout|cart)\b/i.test(text);
    const wantsDb = /\b(?:database|postgres|crm|dashboard|saas|admin)\b/i.test(text);
    const steps = [
      'Scaffold a Vite + React + TypeScript app with lean dependencies',
      `Implement core UI for: ${text.slice(0, 240)}`,
    ];

    if (wantsAuth) {
      steps.push('Add Indobase Auth (sign-in/sign-up) using the linked project credentials');
    }

    if (wantsDb) {
      steps.push('Model data with the Indobase client/tables as needed');
    }

    if (wantsPay) {
      steps.push('Integrate Indobase Payments checkout where relevant');
    }

    steps.push('Emit npm install + npm run dev in the same response');

    return `## Build steps
${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
Prefer shipping a working vertical slice over perfect architecture.`;
  }

  return `## Build steps
1. Create a minimal Vite + React + TypeScript app
2. Implement: ${text.slice(0, 200)}
3. Keep files few; npm install then npm run dev in the same response`;
}

/** Compact one-shot contract for simple Vite landing/UI scaffolds. */
export function getCompactGenerationContractAppendix(target: BuilderProjectTarget): string {
  if (target === 'mobile') {
    return getGenerationContractAppendix(target);
  }

  return `

<indobase_runtime_contract target="web" mode="compact">
Build a minimal root-level Vite + React (TypeScript) web app only — no auth, payments, databases, or backend SDKs unless the user explicitly asked.

Emit as few files as possible (typically: package.json, index.html, vite.config.ts, src/main.tsx, src/App.tsx, one CSS file). Keep dependencies lean (react, react-dom, vite, @vitejs/plugin-react, typescript).

package.json MUST include:
- \`dev\`: \`vite --host 0.0.0.0\`
- \`build\`: \`vite build\`

In the same response emit complete file actions, then exactly one \`<boltAction type="shell">npm install</boltAction>\`, then \`<boltAction type="start">npm run dev</boltAction>\`. Do not ask clarifying questions. After the artifact, optionally add 1-2 short \`<bolt-quick-actions>\` refinement ideas.
</indobase_runtime_contract>`;
}

export function getGenerationContractAppendix(target: BuilderProjectTarget): string {
  const oneShotContract = `

This is a one-shot build response. In the same response, emit complete file actions for the whole runnable project, then exactly one \`<boltAction type="shell">npm install</boltAction>\`, and finish the artifact with \`<boltAction type="start">npm run dev</boltAction>\`. Never claim completion without both execution actions. Never ask the user to choose a recommendation before building and never defer essential files or setup to another turn.

After the complete artifact and start action, include 2-3 concise optional refinement ideas in one \`<bolt-quick-actions>\` group. Use \`type="message"\` and a concrete follow-up prompt for each. These recommendations are part of this same model response; do not call tools, wait for a choice, or omit any build work to produce them.`;

  if (target === 'mobile') {
    return `

<indobase_runtime_contract target="mobile">
Build a root-level Expo project. Do NOT run \`create-expo-app\`, do NOT create a nested application directory, and do not leave setup for a later turn.

Before UI files, write a complete root \`package.json\` with Expo, React, React Native, and React Native Web dependencies. It MUST include:
- \`dev\`: \`expo start --web --host 0.0.0.0\`
- \`build\`: \`expo export --platform web\`

In the same response write a root \`app.json\`, \`App.tsx\` or Expo Router \`app/index.tsx\`, and every referenced source file. The app must work on Expo Web because Builder previews and publishes the generated static web output. Use only Expo-compatible packages.
${oneShotContract}
</indobase_runtime_contract>`;
  }

  return `

<indobase_runtime_contract target="web">
Build a complete root-level Vite web app. Before UI files, write a complete root \`package.json\` with all dependencies and scripts. It MUST include \`dev\`: \`vite --host 0.0.0.0\` and a \`build\` script that produces \`dist/index.html\`.

In the same response write \`index.html\`, the application entry point, and every referenced source/style file.
${oneShotContract}
</indobase_runtime_contract>`;
}

export function inspectOneShotBuildResponse(response: string): OneShotBuildResponseInspection {
  const issues: string[] = [];
  const hasInstallAction =
    /<boltAction\b[^>]*\btype\s*=\s*["']shell["'][^>]*>[\s\S]*?\bnpm\s+(?:install|i)\b[\s\S]*?<\/boltAction>/i.test(
      response,
    );
  const hasStartAction = /<boltAction\b[^>]*\btype\s*=\s*["']start["'][^>]*>[\s\S]*?<\/boltAction>/i.test(response);

  if (!hasInstallAction) {
    issues.push('missing npm install shell action');
  }

  if (!hasStartAction) {
    issues.push('missing start action');
  }

  /*
   * Deliberately NOT enforced: <bolt-quick-actions> recommendations. Forcing a continuation for
   * missing chips makes the model rewrite the whole project again (degrading files) instead of
   * emitting one chips block. The client renders fallback recommendations after preview success.
   */
  return { complete: issues.length === 0, issues };
}

function hasFile(files: Record<string, string>, ...candidates: string[]) {
  return candidates.some((candidate) => Boolean(files[candidate]));
}

export function validateGeneratedProjectContract(files: Record<string, string>): GenerationContractValidation {
  const packageJson = files['package.json'];
  const target: BuilderProjectTarget =
    packageUsesExpo(packageJson) || hasFile(files, 'app.json', 'app.config.ts', 'app.config.js') ? 'mobile' : 'web';
  const issues: string[] = [];

  if (!packageJson) {
    issues.push('Missing root package.json.');
    return { target, issues, valid: false };
  }

  let scripts: Record<string, string> = {};

  try {
    scripts = (JSON.parse(packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    issues.push('package.json is not valid JSON.');
  }

  if (!scripts.build) {
    issues.push('package.json must define a build script.');
  }

  if (target === 'mobile') {
    if (!packageUsesExpo(packageJson)) {
      issues.push('Mobile projects must declare Expo in package.json.');
    }

    if (!hasFile(files, 'app.json', 'app.config.ts', 'app.config.js')) {
      issues.push('Missing Expo app configuration.');
    }

    if (!hasFile(files, 'App.tsx', 'App.jsx', 'app/index.tsx', 'app/index.jsx')) {
      issues.push('Missing a mobile application entry point.');
    }

    if (!/expo\s+export\s+--platform\s+web/.test(scripts.build || '')) {
      issues.push('Mobile build script must export Expo for web.');
    }
  } else {
    if (!hasFile(files, 'index.html')) {
      issues.push('Missing root index.html.');
    }

    if (!hasFile(files, 'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'index.html')) {
      issues.push('Missing a web application entry point.');
    }
  }

  return { target, issues, valid: issues.length === 0 };
}
