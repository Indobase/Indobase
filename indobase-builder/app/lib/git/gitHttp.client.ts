import gitHttp from 'isomorphic-git/http/web';

import { getBuilderAuthHeaders } from '~/lib/indobase/builder-auth.client';

type GitHttpRequest = Parameters<typeof gitHttp.request>[0];

const http = {
  request(request: GitHttpRequest) {
    const headers = {
      ...request.headers,
      ...getBuilderAuthHeaders(),
    };

    return gitHttp.request({
      ...request,
      headers,
    });
  },
};

export default http;
