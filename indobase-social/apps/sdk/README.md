# Indobase Social NodeJS SDK

NodeJS SDK for [Indobase Social](https://social.indobase.in).

```bash
npm install @indobaseinc/social-node
```

## Usage

```typescript
import IndobaseSocial from '@indobaseinc/social-node';
const social = new IndobaseSocial(
  'your api key',
  'https://social.indobase.in/api' // optional self-hosted / custom base URL
);
```

Available methods:

- `post(posts: CreatePostDto)` — schedule a post
- `postList(filters: GetPostsDto)` — list posts
- `upload(file: Buffer, extension: string)` — upload a file
- `integrations()` — list connected channels
- `deletePost(id: string)` — delete a post by ID

See Indobase docs at [https://indobase.in/docs/public-api](https://indobase.in/docs/public-api).
