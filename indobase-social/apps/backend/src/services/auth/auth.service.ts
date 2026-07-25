import { Injectable } from '@nestjs/common';
import { Provider, User } from '@prisma/client';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import dayjs from 'dayjs';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { NewsletterService } from '@gitroom/nestjs-libraries/newsletter/newsletter.service';
import { verify as verifyJwt } from 'jsonwebtoken';

type StudioHandoffClaims = {
  aud?: string;
  email?: string;
  exp?: number;
  project_name?: string;
  project_ref?: string;
  role?: string;
  studio_url?: string;
  sub?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private _userService: UsersService,
    private _organizationService: OrganizationService,
    private _notificationService: NotificationService,
    private _emailService: EmailService,
    private _providerManager: AuthProviderManager
  ) {}
  private studioHandoffOnly() {
    return (
      process.env.STUDIO_HANDOFF_ONLY === 'true' ||
      process.env.STUDIO_HANDOFF_ONLY === '1'
    );
  }

  async canRegister(provider: string) {
    if (this.studioHandoffOnly() && provider === Provider.LOCAL) {
      return false;
    }
    if (
      process.env.DISABLE_REGISTRATION !== 'true' ||
      provider === Provider.GENERIC
    ) {
      return true;
    }

    return (await this._organizationService.getCount()) === 0;
  }

  /**
   * Studio → Indobase Social SSO. Verifies a short-lived Studio JWT
   * (`aud=indobase-social`) and returns a Social session JWT + org id.
   */
  async exchangeStudioHandoff(
    token: string,
    ip: string,
    userAgent: string
  ): Promise<{ jwt: string; organizationId: string }> {
    const secret = (
      process.env.STUDIO_HANDOFF_SECRET ||
      process.env.SOCIAL_HANDOFF_SECRET ||
      ''
    ).trim();
    if (secret.length < 32) {
      throw new Error('studio handoff is not configured');
    }

    let claims: StudioHandoffClaims;
    try {
      claims = verifyJwt(token, secret) as StudioHandoffClaims;
    } catch {
      throw new Error('invalid handoff token');
    }

    if (claims.aud !== 'indobase-social') {
      throw new Error('invalid handoff audience');
    }
    const email = (claims.email || '').trim().toLowerCase();
    const projectRef = (claims.project_ref || '').trim();
    const sub = (claims.sub || '').trim();
    if (!email || !projectRef || !sub) {
      throw new Error('handoff token missing email, project_ref, or sub');
    }

    const orgName = `ib:${projectRef
      .toLowerCase()
      .split('')
      .filter((c) => /[a-z0-9-]/.test(c))
      .join('')
      .slice(0, 48)}`;
    const providerId = `studio:${sub}`;

    let user = await this._userService.getUserByProvider(
      providerId,
      Provider.GENERIC
    );
    let org = await this._organizationService.getOrgByName(orgName);

    if (!user && !org) {
      const created = await this._organizationService.createOrgAndUser(
        {
          company: orgName,
          email,
          password: '',
          provider: Provider.GENERIC,
          providerId,
          datafast_visitor_id: '',
        },
        ip,
        userAgent
      );
      user = created.users[0].user;
      org = { id: created.id } as any;
    } else if (!user && org) {
      const created = await this._organizationService.createOrgAndUser(
        {
          company: `${orgName}-user-${sub.slice(0, 8)}`,
          email,
          password: '',
          provider: Provider.GENERIC,
          providerId,
          datafast_visitor_id: '',
        },
        ip,
        userAgent
      );
      user = created.users[0].user;
      await this._organizationService.addUserToOrg(
        user.id,
        makeStudioInviteId(),
        org.id,
        mapStudioRole(claims.role)
      );
    } else if (user && !org) {
      const created = await this._organizationService.createOrgAndUser(
        {
          company: orgName,
          email: `org+${projectRef}@indobase.local`,
          password: '',
          provider: Provider.GENERIC,
          providerId: `studio-org:${projectRef}`,
          datafast_visitor_id: '',
        },
        ip,
        userAgent
      );
      org = { id: created.id } as any;
      await this._organizationService.addUserToOrg(
        user.id,
        makeStudioInviteId(),
        org.id,
        mapStudioRole(claims.role)
      );
    } else {
      // Ensure membership
      try {
        await this._organizationService.addUserToOrg(
          user!.id,
          makeStudioInviteId(),
          org!.id,
          mapStudioRole(claims.role)
        );
      } catch {
        // already a member
      }
    }

    return {
      jwt: await this.jwt(user!),
      organizationId: org!.id,
    };
  }

  async routeAuth(
    provider: Provider,
    body: CreateOrgUserDto | LoginUserDto,
    ip: string,
    userAgent: string,
    addToOrg?: boolean | { orgId: string; role: 'USER' | 'ADMIN'; id: string }
  ) {
    if (this.studioHandoffOnly() && provider === Provider.LOCAL) {
      throw new Error('Sign in with Indobase Studio');
    }
    if (provider === Provider.LOCAL) {
      if (process.env.DISALLOW_PLUS && body.email.includes('+')) {
        throw new Error('Email with plus sign is not allowed');
      }
      if (body instanceof CreateOrgUserDto) {
        body.email = body.email.toLowerCase();
      }
      const user = await this._userService.getUserByEmail(body.email);
      if (body instanceof CreateOrgUserDto) {
        if (user) {
          throw new Error('Email already exists');
        }

        if (!(await this.canRegister(provider))) {
          throw new Error('Registration is disabled');
        }

        const create = await this._organizationService.createOrgAndUser(
          body,
          ip,
          userAgent
        );

        const addedOrg =
          addToOrg && typeof addToOrg !== 'boolean'
            ? await this._organizationService.addUserToOrg(
                create.users[0].user.id,
                addToOrg.id,
                addToOrg.orgId,
                addToOrg.role
              )
            : false;

        const obj = { addedOrg, jwt: await this.jwt(create.users[0].user) };
        await this._emailService.sendEmail(
          body.email,
          'Activate your account',
          `Click <a href="${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}">here</a> to activate your account`,
          'top'
        );
        return obj;
      }

      if (!user || !AuthChecker.comparePassword(body.password, user.password)) {
        throw new Error('Invalid user name or password');
      }

      if (!user.activated) {
        throw new Error('User is not activated');
      }

      return { addedOrg: false, jwt: await this.jwt(user) };
    }

    const user = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent
    );

    const addedOrg =
      addToOrg && typeof addToOrg !== 'boolean'
        ? await this._organizationService.addUserToOrg(
            user.id,
            addToOrg.id,
            addToOrg.orgId,
            addToOrg.role
          )
        : false;
    return { addedOrg, jwt: await this.jwt(user) };
  }

  public getOrgFromCookie(cookie?: string) {
    if (!cookie) {
      return false;
    }

    try {
      const getOrg: any = AuthChecker.verifyJWT(cookie);
      if (dayjs(getOrg.timeLimit).isBefore(dayjs())) {
        return false;
      }

      return getOrg as {
        email: string;
        role: 'USER' | 'ADMIN';
        orgId: string;
        id: string;
      };
    } catch (err) {
      return false;
    }
  }

  private async loginOrRegisterProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error('Invalid provider token');
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider
    );
    if (user) {
      return user;
    }

    if (!(await this.canRegister(provider))) {
      throw new Error('Registration is disabled');
    }

    const create = await this._organizationService.createOrgAndUser(
      {
        company: body.company,
        email: providerUser.email,
        password: '',
        provider,
        providerId: providerUser.id,
        datafast_visitor_id: body.datafast_visitor_id,
      },
      ip,
      userAgent
    );

    this._track('register', providerUser.email, body.datafast_visitor_id).catch(
      (err) => {}
    );

    await NewsletterService.register(providerUser.email);

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, create.id);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return create.users[0].user;
  }

  private async _track(
    name: string,
    email: string,
    datafast_visitor_id: string
  ) {
    if (email && datafast_visitor_id && process.env.DATAFAST_API_KEY) {
      try {
        await fetch('https://datafa.st/api/v1/goals', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.DATAFAST_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            datafast_visitor_id: datafast_visitor_id,
            name: name,
            metadata: {
              email,
            },
          }),
        });
      } catch (err) {}
    }
  }

  async forgot(email: string) {
    const user = await this._userService.getUserByEmail(email);
    if (!user || user.providerName !== Provider.LOCAL) {
      return false;
    }

    const resetValues = AuthChecker.signJWT({
      id: user.id,
      expires: dayjs().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss'),
    });

    await this._notificationService.sendEmail(
      user.email,
      'Reset your password',
      `You have requested to reset your passsord. <br />Click <a href="${process.env.FRONTEND_URL}/auth/forgot/${resetValues}">here</a> to reset your password<br />The link will expire in 20 minutes`
    );
  }

  forgotReturn(body: ForgotReturnPasswordDto) {
    const user = AuthChecker.verifyJWT(body.token) as {
      id: string;
      expires: string;
    };
    if (dayjs(user.expires).isBefore(dayjs())) {
      return false;
    }

    return this._userService.updatePassword(user.id, body.password);
  }

  async activate(code: string, tracking: string) {
    const user = AuthChecker.verifyJWT(code) as {
      id: string;
      activated: boolean;
      email: string;
    };
    if (user.id && !user.activated) {
      const getUserAgain = await this._userService.getUserByEmail(user.email);
      if (getUserAgain.activated) {
        return false;
      }
      await this._userService.activateUser(user.id);
      user.activated = true;
      this._track('register', user.email, tracking).catch((err) => {});
      await NewsletterService.register(user.email);
      return this.jwt(user as any);
    }

    return false;
  }

  async resendActivationEmail(email: string) {
    const user = await this._userService.getUserByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.activated) {
      throw new Error('Account is already activated');
    }

    const jwt = await this.jwt(user);

    await this._emailService.sendEmail(
      user.email,
      'Activate your account',
      `Click <a href="${process.env.FRONTEND_URL}/auth/activate/${jwt}">here</a> to activate your account`,
      'top'
    );

    return true;
  }

  oauthLink(provider: string, query?: any) {
    const providerInstance = this._providerManager.getProvider(provider);
    return providerInstance.generateLink(query);
  }

  async checkExists(provider: string, code: string, redirectUri?: string) {
    const providerInstance = this._providerManager.getProvider(provider);
    const token = await providerInstance.getToken(code, redirectUri);
    const user = await providerInstance.getUser(token);
    if (!user) {
      throw new Error('Invalid user');
    }
    const checkExists = await this._userService.getUserByProvider(
      user.id,
      provider as Provider
    );
    if (checkExists) {
      return { jwt: await this.jwt(checkExists) };
    }

    return { token };
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }
}

function makeStudioInviteId() {
  return `studio-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function mapStudioRole(role?: string): 'USER' | 'ADMIN' {
  if (role === 'owner' || role === 'admin') return 'ADMIN';
  return 'USER';
}

