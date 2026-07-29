import { atom, computed, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import { sanitizeFileAction, toWorkdirAbsolutePath } from '~/lib/indobase/sanitizeGeneratedArtifact';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import JSZip from 'jszip';
import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import { path } from '~/utils/path';
import { extractRelativePath } from '~/utils/diff';
import { WORK_DIR } from '~/utils/constants';
import { description } from '~/lib/persistence';
import Cookies from 'js-cookie';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, IndobaseBackendAlert } from '~/types/actions';
import { initialBuildLifecycle } from '~/lib/stores/build-lifecycle';

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'diff' | 'preview';

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  /** Subscribe with useStore — do not use the filesCount getter with useStore (it is a number). */
  readonly filesCountAtom: ReadableAtom<number> = computed(this.#filesStore.files, (files) =>
    Object.values(files).reduce((count, entry) => (entry?.type === 'file' ? count + 1 : count), 0),
  );
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);

  #reloadedMessages = new Set<string>();

  artifacts: Artifacts = import.meta.hot?.data?.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data?.showWorkbench ?? atom(false);
  /*
   * Stays 'code' deliberately. Defaulting to 'preview' was tried and is worse: the workbench opens
   * on the first streamed artifact, long before any app is running, so the user would watch a bare
   * spinner for the whole build. Files appearing is real, legible progress. The payoff is handled
   * by the preview-ready subscription at the bottom of this file, which moves them to their running
   * app the moment there is one.
   */
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data?.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data?.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> =
    import.meta.hot?.data?.actionAlert ?? atom<ActionAlert | undefined>(undefined);
  indobaseBackendAlert: WritableAtom<IndobaseBackendAlert | undefined> =
    import.meta.hot?.data?.indobaseBackendAlert ?? atom<IndobaseBackendAlert | undefined>(undefined);
  deployAlert: WritableAtom<DeployAlert | undefined> =
    import.meta.hot?.data?.deployAlert ?? atom<DeployAlert | undefined>(undefined);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #globalExecutionQueue = Promise.resolve();
  constructor() {
    if (import.meta.hot?.data) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.actionAlert = this.actionAlert;
      import.meta.hot.data.indobaseBackendAlert = this.indobaseBackendAlert;
      import.meta.hot.data.deployAlert = this.deployAlert;

      // Ensure binary files are properly preserved across hot reloads
      const filesMap = this.files.get();

      for (const [path, dirent] of Object.entries(filesMap)) {
        if (dirent?.type === 'file' && dirent.isBinary && dirent.content) {
          // Make sure binary content is preserved
          this.files.setKey(path, { ...dirent });
        }
      }
    }
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    // A single failed action must not poison the queue: later actions still run, and
    // waitForExecutionQueue() resolves so finalizeCodegen can judge preview readiness itself.
    this.#globalExecutionQueue = this.#globalExecutionQueue.then(() =>
      callback().catch((error) => {
        console.error('[workbench] queued action failed; continuing queue', error);
      }),
    );
  }

  async waitForExecutionQueue() {
    await this.#globalExecutionQueue;
  }

  async flushPendingActions() {
    await this.actionStreamSampler.flush();
    await this.waitForExecutionQueue();
  }

  refreshAllPreviews() {
    this.#previewsStore.refreshAllPreviews();
  }

  markPreviewLoaded(baseUrl: string) {
    this.#previewsStore.markPreviewLoaded(baseUrl);
  }

  waitForPreviewLoaded(timeoutMs?: number) {
    return this.#previewsStore.waitForPreviewLoaded(timeoutMs);
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }
  get boltTerminal() {
    return this.#terminalStore.boltTerminal;
  }
  get alert() {
    return this.actionAlert;
  }
  clearAlert() {
    this.actionAlert.set(undefined);
  }

  get indobaseBackendAlertAtom() {
    return this.indobaseBackendAlert;
  }

  clearIndobaseBackendAlert() {
    this.indobaseBackendAlert.set(undefined);
  }

  get DeployAlert() {
    return this.deployAlert;
  }

  clearDeployAlert() {
    this.deployAlert.set(undefined);
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }
  attachBoltTerminal(terminal: ITerminal, options?: { force?: boolean }) {
    this.#terminalStore.attachBoltTerminal(terminal, options);
  }

  detachTerminal(terminal: ITerminal) {
    this.#terminalStore.detachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    /*
     * For scoped locks, we would need to implement diff checking here
     * to determine if the user is modifying existing code or just adding new code
     * This is a more complex feature that would be implemented in a future update
     */

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  getModifiedFiles() {
    return this.#filesStore.getModifiedFiles();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  /**
   * Lock a file to prevent edits
   * @param filePath Path to the file to lock
   * @returns True if the file was successfully locked
   */
  lockFile(filePath: string) {
    return this.#filesStore.lockFile(filePath);
  }

  /**
   * Lock a folder and all its contents to prevent edits
   * @param folderPath Path to the folder to lock
   * @returns True if the folder was successfully locked
   */
  lockFolder(folderPath: string) {
    return this.#filesStore.lockFolder(folderPath);
  }

  /**
   * Unlock a file to allow edits
   * @param filePath Path to the file to unlock
   * @returns True if the file was successfully unlocked
   */
  unlockFile(filePath: string) {
    return this.#filesStore.unlockFile(filePath);
  }

  /**
   * Unlock a folder and all its contents to allow edits
   * @param folderPath Path to the folder to unlock
   * @returns True if the folder was successfully unlocked
   */
  unlockFolder(folderPath: string) {
    return this.#filesStore.unlockFolder(folderPath);
  }

  /**
   * Check if a file is locked
   * @param filePath Path to the file to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFileLocked(filePath: string) {
    return this.#filesStore.isFileLocked(filePath);
  }

  /**
   * Check if a folder is locked
   * @param folderPath Path to the folder to check
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFolderLocked(folderPath: string) {
    return this.#filesStore.isFolderLocked(folderPath);
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    try {
      const success = await this.#filesStore.createFile(filePath, content);

      if (success) {
        this.setSelectedFile(filePath);

        /*
         * For empty files, we need to ensure they're not marked as unsaved
         * Only check for empty string, not empty Uint8Array
         */
        if (typeof content === 'string' && content === '') {
          const newUnsavedFiles = new Set(this.unsavedFiles.get());
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to create file:', error);
      throw error;
    }
  }

  async createFolder(folderPath: string) {
    try {
      return await this.#filesStore.createFolder(folderPath);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isCurrentFile = currentDocument?.filePath === filePath;

      const success = await this.#filesStore.deleteFile(filePath);

      if (success) {
        const newUnsavedFiles = new Set(this.unsavedFiles.get());

        if (newUnsavedFiles.has(filePath)) {
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isCurrentFile) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isInCurrentFolder = currentDocument?.filePath?.startsWith(folderPath + '/');

      const success = await this.#filesStore.deleteFolder(folderPath);

      if (success) {
        const unsavedFiles = this.unsavedFiles.get();
        const newUnsavedFiles = new Set<string>();

        for (const file of unsavedFiles) {
          if (!file.startsWith(folderPath + '/')) {
            newUnsavedFiles.add(file);
          }
        }

        if (newUnsavedFiles.size !== unsavedFiles.size) {
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isInCurrentFolder) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  async abortAllActions() {
    const artifacts = Object.values(this.artifacts.get());

    await Promise.all(artifacts.map((artifact) => artifact.runner.abortActiveActions()));

    this.actionAlert.set(undefined);
    this.deployAlert.set(undefined);
    this.indobaseBackendAlert.set(undefined);
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(id);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(id)) {
      this.artifactIdList.push(id);
    }

    this.artifacts.setKey(id, {
      id,
      title,
      closed: false,
      type,
      runner: new ActionRunner(
        webcontainer,
        () => this.boltTerminal,
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.indobaseBackendAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.deployAlert.set(alert);
        },
      ),
    });
  }

  updateArtifact({ artifactId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    if (!artifactId) {
      return;
    }

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(artifactId, { ...artifact, ...state });
  }
  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const payload = data.action.type === 'file' ? { ...data, action: sanitizeFileAction(data.action) } : data;
    const { artifactId } = payload;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      console.warn('[workbench] addAction skipped — artifact not found:', artifactId);
      return;
    }

    return artifact.runner.addAction(payload);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }
  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const payload = data.action.type === 'file' ? { ...data, action: sanitizeFileAction(data.action) } : data;
    const { artifactId } = payload;

    const artifact = this.#getArtifact(artifactId);

    if (!artifact) {
      console.warn('[workbench] runAction skipped — artifact not found:', artifactId);
      return;
    }

    const action = artifact.runner.actions.get()[payload.actionId];

    if (!action || action.executed) {
      return;
    }

    if (payload.action.type === 'file') {
      const fullPath = toWorkdirAbsolutePath(WORK_DIR, payload.action.filePath);

      this.#upsertInMemoryFile(fullPath, payload.action.content);

      /*
       * Mid-stream: avoid thrashing CodeMirror / file-tree selection on every file write.
       * Pick the first file once; full document sync resumes when streaming ends.
       */
      if (!isStreaming) {
        if (this.selectedFile.value !== fullPath) {
          this.setSelectedFile(fullPath);
        }

        /*
         * Only pull focus to the source while the user has no running app to look at. Once a
         * preview exists, a follow-up edit used to yank them out of their app and back into the
         * editor on every file write — the opposite of watching a change take effect.
         */
        if (this.currentView.value === 'diff') {
          this.currentView.set('code');
        }
      } else if (!this.selectedFile.value) {
        this.setSelectedFile(fullPath);
      }

      void artifact.runner.runAction(payload, isStreaming).catch((error) => {
        console.error('[workbench] WebContainer file sync failed:', error);
      });
    } else {
      await artifact.runner.runAction(payload);
    }
  }

  #upsertInMemoryFile(fullPath: string, content: string) {
    const files = this.#filesStore.files.get();
    const relativePath = fullPath.startsWith(`${WORK_DIR}/`)
      ? fullPath.slice(WORK_DIR.length + 1)
      : fullPath.replace(/^\/+/, '');
    const segments = relativePath.split('/').filter(Boolean);

    let currentPath = WORK_DIR;

    for (let index = 0; index < segments.length - 1; index++) {
      currentPath = `${currentPath}/${segments[index]}`;

      if (!files[currentPath]) {
        // Prefer setKey over spreading the whole map for each parent folder.
        this.#filesStore.files.setKey(currentPath, { type: 'folder' });
      }
    }

    this.#filesStore.files.setKey(fullPath, {
      type: 'file',
      content,
      isBinary: false,
      isLocked: false,
    });

    this.#editorStore.documents.setKey(fullPath, {
      value: content,
      filePath: fullPath,
      isBinary: false,
    });
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    return await this._runAction(data, isStreaming);
  }, 100); // TODO: remove this magic number to have it configurable

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  async downloadZip() {
    const zip = new JSZip();
    const files = this.files.get();

    // Get the project name from the description input, or use a default name
    const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    // Generate a simple 6-character hash based on the current timestamp
    const timestampHash = Date.now().toString(36).slice(-6);
    const uniqueProjectName = `${projectName}_${timestampHash}`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content);
        }
      }
    }

    // Generate the zip file and save it
    const content = await zip.generateAsync({ type: 'blob' });
    const { saveAs } = await import('file-saver');
    saveAs(content, `${uniqueProjectName}.zip`);
  }

  async syncFiles(targetHandle: FileSystemDirectoryHandle) {
    const files = this.files.get();
    const syncedFiles = [];

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);
        const pathSegments = relativePath.split('/');
        let currentHandle = targetHandle;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }

        // create or get the file
        const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
          create: true,
        });

        // write the file content
        const writable = await fileHandle.createWritable();
        await writable.write(dirent.content);
        await writable.close();

        syncedFiles.push(relativePath);
      }
    }

    return syncedFiles;
  }

  async pushToRepository(
    provider: 'github' | 'gitlab',
    repoName: string,
    commitMessage?: string,
    username?: string,
    token?: string,
    isPrivate: boolean = false,
    branchName: string = 'main',
  ) {
    try {
      const isGitHub = provider === 'github';
      const isGitLab = provider === 'gitlab';

      const authToken = token || Cookies.get(isGitHub ? 'githubToken' : 'gitlabToken');
      const owner = username || Cookies.get(isGitHub ? 'githubUsername' : 'gitlabUsername');

      if (!authToken || !owner) {
        throw new Error(`${provider} token or username is not set in cookies or provided.`);
      }

      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
      }

      if (isGitHub) {
        // Initialize Octokit with the auth token
        const octokit = new Octokit({ auth: authToken });

        // Check if the repository already exists before creating it
        let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];
        let visibilityJustChanged = false;

        try {
          const resp = await octokit.repos.get({ owner, repo: repoName });
          repo = resp.data;
          console.log('Repository already exists, using existing repo');

          // Check if we need to update visibility of existing repo
          if (repo.private !== isPrivate) {
            console.log(
              `Updating repository visibility from ${repo.private ? 'private' : 'public'} to ${isPrivate ? 'private' : 'public'}`,
            );

            try {
              // Update repository visibility using the update method
              const { data: updatedRepo } = await octokit.repos.update({
                owner,
                repo: repoName,
                private: isPrivate,
              });

              console.log('Repository visibility updated successfully');
              repo = updatedRepo;
              visibilityJustChanged = true;

              // Add a delay after changing visibility to allow GitHub to fully process the change
              console.log('Waiting for visibility change to propagate...');
              await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
            } catch (visibilityError) {
              console.error('Failed to update repository visibility:', visibilityError);

              // Continue with push even if visibility update fails
            }
          }
        } catch (error) {
          if (error instanceof Error && 'status' in error && error.status === 404) {
            // Repository doesn't exist, so create a new one
            console.log(`Creating new repository with private=${isPrivate}`);

            // Create new repository with specified privacy setting
            const createRepoOptions = {
              name: repoName,
              private: isPrivate,
              auto_init: true,
            };

            console.log('Create repo options:', createRepoOptions);

            const { data: newRepo } = await octokit.repos.createForAuthenticatedUser(createRepoOptions);

            console.log('Repository created:', newRepo.html_url, 'Private:', newRepo.private);
            repo = newRepo;

            // Add a small delay after creating a repository to allow GitHub to fully initialize it
            console.log('Waiting for repository to initialize...');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          } else {
            console.error('Cannot create repo:', error);
            throw error; // Some other error occurred
          }
        }

        // Get all files
        const files = this.files.get();

        if (!files || Object.keys(files).length === 0) {
          throw new Error('No files found to push');
        }

        // Function to push files with retry logic
        const pushFilesToRepo = async (attempt = 1): Promise<string> => {
          const maxAttempts = 3;

          try {
            console.log(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

            // Create blobs for each file
            const blobs = await Promise.all(
              Object.entries(files).map(async ([filePath, dirent]) => {
                if (dirent?.type === 'file' && dirent.content) {
                  const { data: blob } = await octokit.git.createBlob({
                    owner: repo.owner.login,
                    repo: repo.name,
                    content: Buffer.from(dirent.content).toString('base64'),
                    encoding: 'base64',
                  });
                  return { path: extractRelativePath(filePath), sha: blob.sha };
                }

                return null;
              }),
            );

            const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

            if (validBlobs.length === 0) {
              throw new Error('No valid files to push');
            }

            // Refresh repository reference to ensure we have the latest data
            const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
            repo = repoRefresh.data;

            // Get the latest commit SHA (assuming main branch, update dynamically if needed)
            const { data: ref } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
            });
            const latestCommitSha = ref.object.sha;

            // Create a new tree
            const { data: newTree } = await octokit.git.createTree({
              owner: repo.owner.login,
              repo: repo.name,
              base_tree: latestCommitSha,
              tree: validBlobs.map((blob) => ({
                path: blob!.path,
                mode: '100644',
                type: 'blob',
                sha: blob!.sha,
              })),
            });

            // Create a new commit
            const { data: newCommit } = await octokit.git.createCommit({
              owner: repo.owner.login,
              repo: repo.name,
              message: commitMessage || 'Initial commit from your app',
              tree: newTree.sha,
              parents: [latestCommitSha],
            });

            // Update the reference
            await octokit.git.updateRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
              sha: newCommit.sha,
            });

            console.log('Files successfully pushed to repository');

            return repo.html_url;
          } catch (error) {
            console.error(`Error during push attempt ${attempt}:`, error);

            // If we've just changed visibility and this is not our last attempt, wait and retry
            if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
              const delayMs = attempt * 2000; // Increasing delay with each attempt
              console.log(`Waiting ${delayMs}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));

              return pushFilesToRepo(attempt + 1);
            }

            throw error; // Rethrow if we're out of attempts
          }
        };

        // Execute the push function with retry logic
        const repoUrl = await pushFilesToRepo();

        // Return the repository URL
        return repoUrl;
      }

      if (isGitLab) {
        const { GitLabApiService: gitLabApiServiceClass } = await import('~/lib/services/gitlabApiService');
        const gitLabApiService = new gitLabApiServiceClass(authToken, 'https://gitlab.com');

        // Check or create repo
        let repo = await gitLabApiService.getProject(owner, repoName);

        if (!repo) {
          repo = await gitLabApiService.createProject(repoName, isPrivate);
          await new Promise((r) => setTimeout(r, 2000)); // Wait for repo initialization
        }

        // Check if branch exists, create if not
        const branchRes = await gitLabApiService.getFile(repo.id, 'README.md', branchName).catch(() => null);

        if (!branchRes || !branchRes.ok) {
          // Create branch from default
          await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
          await new Promise((r) => setTimeout(r, 1000));
        }

        const actions = Object.entries(files).reduce(
          (acc, [filePath, dirent]) => {
            if (dirent?.type === 'file' && dirent.content) {
              acc.push({
                action: 'create',
                file_path: extractRelativePath(filePath),
                content: dirent.content,
              });
            }

            return acc;
          },
          [] as { action: 'create' | 'update'; file_path: string; content: string }[],
        );

        // Check which files exist and update action accordingly
        for (const action of actions) {
          const fileCheck = await gitLabApiService.getFile(repo.id, action.file_path, branchName);

          if (fileCheck.ok) {
            action.action = 'update';
          }
        }

        // Commit all files
        await gitLabApiService.commitFiles(repo.id, {
          branch: branchName,
          commit_message: commitMessage || 'Commit multiple files',
          actions,
        });

        return repo.web_url;
      }

      // Should not reach here since we only handle GitHub and GitLab
      throw new Error(`Unsupported provider: ${provider}`);
    } catch (error) {
      console.error('Error pushing to repository:', error);
      throw error; // Rethrow the error for further handling
    }
  }
}

export const workbenchStore = new WorkbenchStore();

/*
 * The end of a build is the moment the user has been waiting for, so land them on their running
 * app. Previously the workbench stayed wherever the last file write left it — almost always the
 * code editor — so "I built you an app" resolved into a screen of source. Only the transition into
 * preview-ready fires this, so a user who deliberately opens Code mid-build is not yanked away.
 */
initialBuildLifecycle.subscribe((state) => {
  if (state === 'preview-ready') {
    workbenchStore.currentView.set('preview');

    /*
     * The reveal. Nothing opens the workbench during a build any more, so this is where the app
     * arrives — the user stays in the conversation while it is built, then their running app slides
     * in. If they already opened it themselves, this is a no-op.
     */
    workbenchStore.showWorkbench.set(true);
  }

  /*
   * A failed build must not leave the user in a chat with no way to see what happened — nothing
   * opens the workbench during the build any more, so open it here and land on the source, which
   * is where the answer is.
   */
  if (state === 'failed') {
    workbenchStore.currentView.set('code');
    workbenchStore.showWorkbench.set(true);
  }
});
