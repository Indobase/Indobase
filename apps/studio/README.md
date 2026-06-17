# Indobase Studio

A dashboard for **Indobase SaaS** (organizations, projects, SQL editor, auth, storage APIs), also used on [indobase.in/dashboard](https://indobase.in/dashboard). Built with:

- [Next.js](https://nextjs.org/)
- [Tailwind](https://tailwindcss.com/)

## What's included

Studio is designed to work with existing deployments - either the local hosted, docker setup, or our CLI. It is not intended for managing the deployment and administration of projects - that's out of scope.

As such, the features exposed on Studio for existing deployments are limited to those which manage your database:

- Table & SQL editors
  - Saved queries are unavailable
- Database management
  - Policies, roles, extensions, replication
- API documentation

## Managing Project Settings

Project settings are managed outside of the Dashboard. If you use docker compose, you should manage the settings in your docker-compose file. If you're deploying Indobase to your own cloud, you should store your secrets and env vars in a vault or secrets manager.

## How to contribute?

- Branch from `master` and name your branches with the following structure
  - `{type}/{branch_name}`
    - Type: `chore | fix | feature`
    - The branch name is arbitrary — just make sure it summarizes the work.
- When you send a PR to `master`, it will automatically tag members of the frontend team for review.
- Review the [contributing checklists](contributing/contributing-checklists.md) to help test your feature before sending a PR.
- The Dashboard is under active development. You should run `git pull` frequently to make sure you're up to date.

### Developer Quickstart

```bash
# You'll need to be on Node v20
# in apps/studio

pnpm install   # install dependencies
pnpm run dev   # start dev server
pnpm run test  # run tests
pnpm run test -- --watch  # run tests in watch mode
```

For the full stack (Kong, Postgres, GoTrue, etc.), follow the [Docker deployment guide](https://indobase.in/docs/guides/hosting/docker) and [DEVELOPERS.md](../../DEVELOPERS.md) at the repo root.

## Running within a SaaS environment

Follow the [Docker deployment guide](https://indobase.in/docs/guides/hosting/docker) to run the full stack locally.

```
cd ..
cd docker
docker compose -f docker-compose.yml -f ./dev/docker-compose.dev.yml up
```

Once you've got that set up, update `.env` in the studio folder with the corresponding values.

```
POSTGRES_PASSWORD=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
```

Then run the following commands to install dependencies and start the dashboard.

```
npm install
npm run dev
```

If you would like to configure different defaults for "Default Organization" and "Default Project", you will need to update the `.env` in the studio folder with the corresponding values.

```
DEFAULT_ORGANIZATION_NAME=
DEFAULT_PROJECT_NAME=
```
