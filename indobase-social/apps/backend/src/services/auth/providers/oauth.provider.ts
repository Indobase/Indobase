import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';

@AuthProvider({ provider: 'GENERIC' })
export class OauthProvider extends AuthProviderAbstract {
  private getConfig() {
    const authUrl =
      process.env.INDOBASE_OAUTH_AUTH_URL || process.env.POSTIZ_OAUTH_AUTH_URL;
    const clientId =
      process.env.INDOBASE_OAUTH_CLIENT_ID || process.env.POSTIZ_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.INDOBASE_OAUTH_CLIENT_SECRET ||
      process.env.POSTIZ_OAUTH_CLIENT_SECRET;
    const tokenUrl =
      process.env.INDOBASE_OAUTH_TOKEN_URL || process.env.POSTIZ_OAUTH_TOKEN_URL;
    const userInfoUrl =
      process.env.INDOBASE_OAUTH_USERINFO_URL ||
      process.env.POSTIZ_OAUTH_USERINFO_URL;
    const { FRONTEND_URL: frontendUrl } = process.env;

    if (
      !userInfoUrl ||
      !tokenUrl ||
      !clientId ||
      !clientSecret ||
      !authUrl ||
      !frontendUrl
    ) {
      throw new Error(
        'INDOBASE_OAUTH (or legacy POSTIZ_OAUTH) environment variables are not set'
      );
    }

    return {
      authUrl,
      clientId,
      clientSecret,
      tokenUrl,
      userInfoUrl,
      frontendUrl,
    };
  }

  generateLink(): string {
    const { authUrl, clientId, frontendUrl } = this.getConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'openid profile email',
      response_type: 'code',
      redirect_uri: `${frontendUrl}/settings`,
    });

    return `${authUrl}?${params.toString()}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { tokenUrl, clientId, clientSecret, frontendUrl } = this.getConfig();
    const response = await fetch(`${tokenUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${frontendUrl}/settings`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const { userInfoUrl } = this.getConfig();
    const response = await fetch(`${userInfoUrl}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    const { email, sub: id } = await response.json();
    return { email, id };
  }
}
