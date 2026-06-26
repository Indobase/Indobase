import { useSearchParams } from '@remix-run/react';
import { generateId, type Message } from 'ai';
import ignore from 'ignore';
import { useEffect, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { useGit } from '~/lib/hooks/useGit';
import { useChatHistory } from '~/lib/persistence';
import { createCommandsMessage, detectProjectCommands, escapeBoltTags } from '~/utils/projectCommands';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';
import { toast } from 'react-toastify';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.github/**',
  '.vscode/**',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.png',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.yaml',
];

const BOOT_TIMEOUT_MS = 90_000;

export function GitUrlImport() {
  const [searchParams] = useSearchParams();
  const { ready: historyReady, importChat } = useChatHistory();
  const { bootError, ready: gitReady, gitClone } = useGit();
  const [loading, setLoading] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('Preparing your workspace...');
  const startedRef = useRef(false);

  const failImport = (message: string) => {
    toast.error(message);
    setLoading(false);
    window.location.href = '/';
  };

  const importRepo = async (repoUrl: string) => {
    if (!gitReady || !historyReady) {
      throw new Error('Workspace is not ready yet.');
    }

    if (!importChat) {
      throw new Error('Chat import is unavailable in this browser.');
    }

    const ig = ignore().add(IGNORE_PATTERNS);
    setOverlayMessage('Please wait while we clone the repository...');

    const { workdir, data } = await gitClone(repoUrl);
    const filePaths = Object.keys(data).filter((filePath) => !ig.ignores(filePath));
    const textDecoder = new TextDecoder('utf-8');

    const fileContents = filePaths
      .map((filePath) => {
        const { data: content, encoding } = data[filePath];
        return {
          path: filePath,
          content: encoding === 'utf8' ? content : content instanceof Uint8Array ? textDecoder.decode(content) : '',
        };
      })
      .filter((f) => f.content);

    if (fileContents.length === 0) {
      throw new Error('Repository cloned but no readable project files were found.');
    }

    const commands = await detectProjectCommands(fileContents);
    const commandsMessage = createCommandsMessage(commands);

    const filesMessage: Message = {
      role: 'assistant',
      content: `Cloning the repo ${repoUrl} into ${workdir}
<boltArtifact id="imported-files" title="Git Cloned Files"  type="bundled">
${fileContents
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>`,
      id: generateId(),
      createdAt: new Date(),
    };

    const messages = [filesMessage];

    if (commandsMessage) {
      messages.push({
        role: 'user',
        id: generateId(),
        content: 'Setup the codebase and Start the application',
      });
      messages.push(commandsMessage);
    }

    setOverlayMessage('Starting your imported project...');
    await importChat(`Git Project:${repoUrl.split('/').slice(-1)[0]}`, messages, { gitUrl: repoUrl });
  };

  useEffect(() => {
    if (bootError) {
      failImport(bootError.message);
    }
  }, [bootError]);

  useEffect(() => {
    if (!loading || gitReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      failImport(
        'Workspace failed to start. Use Chrome or Edge, disable extensions that block SharedArrayBuffer, then hard-refresh.',
      );
    }, BOOT_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [gitReady, loading]);

  useEffect(() => {
    const repoUrl = searchParams.get('url');

    if (!repoUrl) {
      window.location.href = '/';
      return;
    }

    if (startedRef.current || bootError) {
      return;
    }

    if (!historyReady || !gitReady) {
      setLoading(true);
      setOverlayMessage('Preparing your workspace...');
      return;
    }

    startedRef.current = true;
    setLoading(true);

    importRepo(repoUrl).catch((error) => {
      console.error('Error importing repo:', error);
      failImport(error instanceof Error ? error.message : 'Failed to import repository');
    });
  }, [bootError, gitReady, historyReady, searchParams]);

  return (
    <ClientOnly fallback={<BaseChat />}>
      {() => (
        <>
          <Chat />
          {loading && <LoadingOverlay message={overlayMessage} />}
        </>
      )}
    </ClientOnly>
  );
}
