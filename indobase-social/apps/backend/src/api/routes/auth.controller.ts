import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response, Request } from 'express';

import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { ForgotPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot.password.dto';
import { ResendActivationDto } from '@gitroom/nestjs-libraries/dtos/auth/resend-activation.dto';
import { ApiTags } from '@nestjs/swagger';
import { getAuthCookieOptions } from '@gitroom/helpers/utils/auth-cookie';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { RealIP } from 'nestjs-real-ip';
import { UserAgent } from '@gitroom/nestjs-libraries/user/user.agent';
import { Provider } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { resolveStudioPublicUrl } from '@gitroom/helpers/utils/studio-public-url';

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(
    private _authService: AuthService,
    private _emailService: EmailService
  ) {}

  @Get('/can-register')
  async canRegister() {
    return {
      register: await this._authService.canRegister(Provider.LOCAL as string),
    };
  }

  /**
   * Studio → Indobase Social SSO exchange (full-page GET, sets auth cookie).
   * Mirror of Email `/api/studio.handoff` and Payments `/oauth/studio-handoff`.
   */
  @Get('/studio-handoff')
  async studioHandoff(
    @Query('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      if (!token?.trim()) {
        throw new Error('missing handoff token');
      }
      const { jwt, organizationId } = await this._authService.exchangeStudioHandoff(
        token.trim(),
        ip,
        userAgent
      );

      response.cookie('auth', jwt, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

      response.cookie('showorg', organizationId, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

      if (process.env.NOT_SECURED) {
        response.header('auth', jwt);
        response.header('showorg', organizationId);
      }

      return response.redirect(302, '/');
    } catch (e: any) {
      const studio = resolveStudioPublicUrl(req.headers.host);
      return response.redirect(
        302,
        `${studio}/sign-in?returnTo=${encodeURIComponent('/')}`
      );
    }
  }

  @Post('/register')
  async register(
    @Req() req: Request,
    @Body() body: CreateOrgUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie
      );

      const activationRequired =
        body.provider === 'LOCAL' && this._emailService.hasProvider();

      if (activationRequired) {
        response.header('activate', 'true');
        response.status(200).json({ activate: true });
        return;
      }

      response.cookie('auth', jwt, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

      if (process.env.NOT_SECURED) {
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

        if (process.env.NOT_SECURED) {
          response.header('showorg', addedOrg.organizationId);
        }
      }

      Sentry.metrics.count('new_user', 1);
      response.header('onboarding', 'true');
      response.status(200).json({
        register: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  @Post('/login')
  async login(
    @Req() req: Request,
    @Body() body: LoginUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie
      );

      response.cookie('auth', jwt, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

      if (process.env.NOT_SECURED) {
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

        if (process.env.NOT_SECURED) {
          response.header('showorg', addedOrg.organizationId);
        }
      }

      response.header('reload', 'true');
      response.status(200).json({
        login: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  @Post('/forgot')
  async forgot(@Body() body: ForgotPasswordDto) {
    try {
      await this._authService.forgot(body.email);
      return {
        forgot: true,
      };
    } catch (e) {
      return {
        forgot: false,
      };
    }
  }

  @Post('/forgot-return')
  async forgotReturn(@Body() body: ForgotReturnPasswordDto) {
    const reset = await this._authService.forgotReturn(body);
    return {
      reset: !!reset,
    };
  }

  @Get('/oauth-mobile-callback')
  mobileCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const scheme = process.env.MOBILE_APP_SCHEME || 'indobase-social://auth/callback';
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (state) params.set('state', state);
    return response.redirect(302, `${scheme}?${params.toString()}`);
  }

  @Get('/oauth/:provider')
  async oauthLink(@Param('provider') provider: string, @Query() query: any) {
    return this._authService.oauthLink(provider, query);
  }

  @Post('/activate')
  async activate(
    @Body('code') code: string,
    @Body('datafast_visitor_id') datafast_visitor_id: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const activate = await this._authService.activate(
      code,
      datafast_visitor_id
    );
    if (!activate) {
      return response.status(200).json({ can: false });
    }

    response.cookie('auth', activate, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

    if (process.env.NOT_SECURED) {
      response.header('auth', activate);
    }

    response.header('onboarding', 'true');

    return response.status(200).json({ can: true });
  }

  @Post('/resend-activation')
  async resendActivation(@Body() body: ResendActivationDto) {
    try {
      await this._authService.resendActivationEmail(body.email);
      return {
        success: true,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message,
      };
    }
  }

  @Post('/oauth/:provider/exists')
  async oauthExists(
    @Body('code') code: string,
    @Body('redirect_uri') redirect_uri: string,
    @Param('provider') provider: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const { jwt, token } = await this._authService.checkExists(
      provider,
      code,
      redirect_uri
    );

    if (token) {
      return response.json({ token });
    }

    response.cookie('auth', jwt, { ...getAuthCookieOptions({ expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), }) });

    if (process.env.NOT_SECURED) {
      response.header('auth', jwt);
    }

    response.header('reload', 'true');

    response.status(200).json({
      login: true,
    });
  }
}
