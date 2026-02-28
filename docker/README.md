# Self-Hosted Indobase with Docker

This is the Docker Compose setup for self-hosted Indobase. It provides a complete stack with all Indobase services running locally or on your infrastructure.

## Getting Started

For setup and configuration, see:

- **[Indobase self-hosting](https://indobase.fun/docs/guides/hosting/overview)** – Overview and options
- **[Single-domain deployment](../SINGLE_DOMAIN.md)** – Deploy marketing, Studio, and backend on one domain (e.g. indobase.fun)
- **[WIRING.md](../WIRING.md)** – How marketing, Studio, and backend URLs and env are wired

The setup typically covers:

- Prerequisites (Git and Docker)
- Initial setup and configuration
- Securing your installation
- Accessing services
- Updating your instance

## What's Included

This Docker Compose configuration includes the following services:

- **[Studio](https://github.com/indobase/indobase/tree/master/apps/studio)** – Dashboard for managing your self-hosted Indobase project
- **[Kong](https://github.com/Kong/kong)** – API gateway
- **[Auth](https://github.com/supabase/gotrue)** – JWT-based authentication API for sign-ups, logins, and session management
- **[PostgREST](https://github.com/PostgREST/postgrest)** – Web server that turns PostgreSQL into a RESTful API
- **[Realtime](https://github.com/supabase/realtime)** – Listens to PostgreSQL changes and broadcasts over websockets
- **[Storage](https://github.com/supabase/storage-api)** – RESTful API for files in S3, with Postgres permissions
- **[imgproxy](https://github.com/imgproxy/imgproxy)** – Image processing server
- **[postgres-meta](https://github.com/supabase/postgres-meta)** – API for managing Postgres (tables, roles, queries)
- **[PostgreSQL](https://www.postgresql.org/)** – Database
- **[Edge Runtime](https://github.com/supabase/edge-runtime)** – Deno-based runtime for Edge Functions
- **[Logflare](https://github.com/Logflare/logflare)** – Log management
- **[Vector](https://github.com/vectordotdev/vector)** – Observability pipeline for logs
- **[Supavisor](https://github.com/supabase/supavisor)** – Postgres connection pooler

## Documentation

- **[Indobase docs](https://indobase.fun/docs)** – Guides and reference
- **[CHANGELOG.md](./CHANGELOG.md)** – Recent changes to services
- **[versions.md](./versions.md)** – Docker image versions for rollback

## Updates

To update your self-hosted Indobase instance:

1. Review [CHANGELOG.md](./CHANGELOG.md) for breaking changes
2. Check [versions.md](./versions.md) for new image versions
3. Update `docker-compose.yml` if needed
4. Pull the latest images: `docker compose pull`
5. Stop services: `docker compose down`
6. Start with new configuration: `docker compose up -d`

**Note:** Back up your database before updating.

## Community & Support

- [GitHub Discussions](https://github.com/indobase/indobase/discussions) – Questions and feature requests
- [GitHub Issues](https://github.com/indobase/indobase/issues) – Bug reports
- [Discord](https://discord.indobase.fun) – Community chat

## Important Notes

### Security

⚠️ **The default configuration is not secure for production.**

Before deploying to production you must:

- Update all default passwords and secrets in the `.env` file
- Generate new JWT secrets
- Review and update CORS settings
- Put a secure reverse proxy in front of the stack
- Review network security (ACLs, etc.)
- Set up backup procedures

See the [security section](https://indobase.fun/docs/guides/hosting/overview) in the documentation where applicable.

## License

This repository is licensed under the Apache 2.0 License. See the [Indobase repository](https://github.com/indobase/indobase) for details.
