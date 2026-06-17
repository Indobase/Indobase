# Developing Indobase Docs

## Getting started

Thanks for your interest in [Indobase docs](https://indobase.in/docs) and for wanting to contribute! Before you begin, read the
[code of conduct](../../CODE_OF_CONDUCT.md) and check out the
[existing issues](https://github.com/Indobase/Indobase/issues).
This document describes how to set up your development environment to contribute to [Indobase docs](https://indobase.in/docs).

For a complete run-down on how all of our tools work together, see the main [DEVELOPERS.md](../../DEVELOPERS.md). That readme describes how to get set up locally in lots of detail, including minimum requirements, our Turborepo setup, installing packages, sharing components across projects, and more. This readme deals specifically with the docs site.

> [!TIP]
> Branch from `main` and open PRs against this repo directly when you have write access. This lets CI checks auto-run and speeds up review.

## Local setup

[indobase.in/docs](https://indobase.in/docs) is a Next.js site. You can get setup by following the same steps for all of our other Next.js projects:

1. Follow the steps outlined in the Local Development section of the main [DEVELOPERS.md](../../DEVELOPERS.md)
2. Create a `.env` file in `apps/docs` if needed and set `NEXT_PUBLIC_IS_PLATFORM=false` for local docs development
3. Start the local docs site by navigating to `apps/docs` and running `pnpm run dev`
4. Visit http://localhost:3001/docs in your browser — don't forget to append `/docs` to the end
5. Your local site should mirror [https://indobase.in/docs](https://indobase.in/docs)

## Contributing

For repo organization and style guide, see [CONTRIBUTING.md](./CONTRIBUTING.md).
