import type { Message } from 'ai';
import type { FileMap } from '~/lib/.server/llm/constants';

export type BuilderProjectTarget = 'web' | 'mobile';

export type GenerationContractValidation = {
  target: BuilderProjectTarget;
  issues: string[];
  valid: boolean;
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
  if (!packageJson) return false;

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
  if (!files || !fileName) return undefined;

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

export function getGenerationContractAppendix(target: BuilderProjectTarget): string {
  if (target === 'mobile') {
    return `

<indobase_runtime_contract target="mobile">
Build a root-level Expo project. Do NOT run \`create-expo-app\`, do NOT create a nested application directory, and do not leave setup for a later turn.

Before UI files, write a complete root \`package.json\` with Expo, React, React Native, and React Native Web dependencies. It MUST include:
- \`dev\`: \`expo start --web --host 0.0.0.0\`
- \`build\`: \`expo export --platform web\`

In the same response write a root \`app.json\`, \`App.tsx\` or Expo Router \`app/index.tsx\`, and every referenced source file. The app must work on Expo Web because Builder previews and publishes the generated static web output. Use only Expo-compatible packages. After files are written, install once and start the Expo web server as the final action.
</indobase_runtime_contract>`;
  }

  return `

<indobase_runtime_contract target="web">
Build a complete root-level Vite web app. Before UI files, write a complete root \`package.json\` with all dependencies and scripts. It MUST include \`dev\`: \`vite --host 0.0.0.0\` and a \`build\` script that produces \`dist/index.html\`.

In the same response write \`index.html\`, the application entry point, and every referenced source/style file. Do not leave setup, dependencies, or essential screens for a later turn. After files are written, install once and start the Vite server as the final action.
</indobase_runtime_contract>`;
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

  if (!scripts.build) issues.push('package.json must define a build script.');

  if (target === 'mobile') {
    if (!packageUsesExpo(packageJson)) issues.push('Mobile projects must declare Expo in package.json.');
    if (!hasFile(files, 'app.json', 'app.config.ts', 'app.config.js')) issues.push('Missing Expo app configuration.');
    if (!hasFile(files, 'App.tsx', 'App.jsx', 'app/index.tsx', 'app/index.jsx')) {
      issues.push('Missing a mobile application entry point.');
    }
    if (!/expo\s+export\s+--platform\s+web/.test(scripts.build || '')) {
      issues.push('Mobile build script must export Expo for web.');
    }
  } else {
    if (!hasFile(files, 'index.html')) issues.push('Missing root index.html.');
    if (!hasFile(files, 'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'index.html')) {
      issues.push('Missing a web application entry point.');
    }
  }

  return { target, issues, valid: issues.length === 0 };
}
