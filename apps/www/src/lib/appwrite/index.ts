import { env as publicEnv } from '$env/dynamic/public';
import { Client, Databases, Functions, Storage } from '@appwrite.io/console';

export const client = new Client();

const endpoint = publicEnv.PUBLIC_APPWRITE_ENDPOINT ?? 'https://indobase.fun/api/v1';
const projectId = publicEnv.PUBLIC_APPWRITE_PROJECT_ID ?? '';

if (endpoint && projectId) {
    client.setEndpoint(endpoint).setProject(projectId);
}

export const databases = new Databases(client);
export const functions = new Functions(client);
export const storage = new Storage(client);
