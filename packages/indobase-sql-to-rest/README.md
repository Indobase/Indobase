# @indobaseinc/sql-to-rest

Translate SQL `SELECT` queries into PostgREST HTTP requests and `@indobaseinc/indobase-js` client code.

## Usage

```ts
import { processSql, renderHttp, renderIndobaseJs } from '@indobaseinc/sql-to-rest'

const statement = await processSql('select * from books')
const http = await renderHttp(statement)
const { code } = await renderIndobaseJs(statement)
```

See package exports for HTTP formatters (`formatCurl`, `formatHttp`) and error types.
