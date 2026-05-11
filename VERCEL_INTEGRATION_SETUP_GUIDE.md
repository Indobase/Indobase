# Vercel Integration Setup Guide for Indobase SaaS

## Overview

This guide provides step-by-step instructions to enable Vercel deployment for your Indobase SaaS customers. Your customers will be able to deploy projects using Vercel's Deploy Button or Marketplace integration.

---

## Prerequisites

Before starting, ensure you have:

- Vercel account (Team plan recommended for SaaS)
- Access to your Indobase Studio deployment
- Admin access to configure environment variables

---

## Step 1: Register Your Integration with Vercel

### 1.1 Access Vercel Integrations Developer Portal

Navigate to: `https://vercel.com/integrations/new`

### 1.2 Create a New Integration

Click **"Create Integration"** and select:

- [ ] **Deploy Button** - For one-click project creation
- [ ] **Marketplace** - For connecting existing Vercel projects

### 1.3 Fill in Integration Details

| Field | Value |
|-------|-------|
| **Name** | `Indobase` (or your branding) |
| **Description** | Database and authentication for your projects |
| **Logo** | Upload your company logo (512x512 recommended) |
| **Category** | Database / Backend |

### 1.4 Configure Integration Type

Select **"Both"** to support:
- Deploy Button functionality
- Marketplace installation

---

## Step 2: Set Up OAuth Credentials

### 2.1 Get Vercel OAuth Credentials

After creating the integration, you'll receive:

- **Client ID**: `VERCEL_CLIENT_ID`
- **Client Secret**: `VERCEL_CLIENT_SECRET`

### 2.2 Add Credentials to Your Environment

**For Docker/Production deployment**, add to `docker/.env`:

```bash
VERCEL_CLIENT_ID=your_vercel_client_id
VERCEL_CLIENT_SECRET=your_vercel_client_secret
```

**For local development**, add to `apps/studio/.env`:

```bash
VERCEL_CLIENT_ID=your_vercel_client_id
VERCEL_CLIENT_SECRET=your_vercel_client_secret
```

---

## Step 3: Configure Redirect URLs

### 3.1 In Vercel Integration Dashboard

Add the following redirect URLs (Callback URLs):

```
# Production URLs
https://your-studio-domain.com/integrations/vercel/callback
https://your-studio-domain.com/integrations/vercel/install
https://your-studio-domain.com/integrations/vercel/manage

# Local Development URLs
http://localhost:8082/integrations/vercel/callback
http://localhost:8082/integrations/vercel/install
```

### 3.2 URL Patterns Explained

| URL Path | Purpose |
|----------|---------|
| `/integrations/vercel/install` | Initial OAuth flow entry point |
| `/integrations/vercel/callback` | OAuth callback from Vercel |
| `/integrations/vercel/{orgSlug}/deploy-button/new-project` | Create new project via Deploy Button |
| `/integrations/vercel/{orgSlug}/marketplace/choose-project` | Connect existing projects |

---

## Step 4: Update Your Code

### 4.1 Update Integration URL

**File**: `apps/studio/components/interfaces/Settings/Integrations/VercelIntegration/VercelSection.tsx`

**Line ~148-152** - Change:

```typescript
// BEFORE (Supabase reference):
const integrationUrl =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod'
    ? 'https://vercel.com/integrations/supabase'
    : 'https://vercel.com/integrations/supabase-staging'

// AFTER (Your integration):
const integrationUrl =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod'
    ? 'https://vercel.com/integrations/your-indobase-integration'
    : 'https://vercel.com/integrations/your-indobase-integration-staging'
```

### 4.2 Environment Variables for Studio

**File**: `apps/studio/.env` (or your deployment config)

```bash
# Vercel Integration Settings
NEXT_PUBLIC_SITE_URL=https://your-studio-domain.com

# Vercel API Credentials (Server-side only)
VERCEL_CLIENT_ID=your_client_id
VERCEL_CLIENT_SECRET=your_client_secret

# Integration URL shown in UI
NEXT_PUBLIC_VERCEL_INTEGRATION_URL=https://vercel.com/integrations/your-indobase-integration
```

---

## Step 5: Create Vercel API Endpoint (Optional Backend)

If you need custom OAuth handling, create this endpoint:

**File**: `apps/studio/pages/api/integrations/vercel/oauth.ts`

```typescript
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code, configuration_id, team_id, next } = req.query

  if (!code) {
    return res.status(400).json({ error: 'Missing OAuth code' })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://api.vercel.com/v2/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.VERCEL_CLIENT_ID!,
        client_secret: process.env.VERCEL_CLIENT_SECRET!,
        code: code as string,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/vercel/oauth`,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error || 'Failed to get access token')
    }

    // Store token for the organization (implement your storage logic)
    // await saveVercelToken(orgId, tokenData)

    // Redirect to project selection
    const redirectUrl = next || '/integrations/vercel/select-project'
    res.redirect(`${redirectUrl}?configuration_id=${configuration_id}`)

  } catch (error) {
    console.error('Vercel OAuth error:', error)
    res.status(500).json({ error: 'OAuth flow failed' })
  }
}
```

---

## Step 6: Set Up Your Vercel Project (For Your Own Deployment)

### 6.1 Add Environment Variables to Vercel

In your Vercel project settings, add:

```bash
# Studio URL
NEXT_PUBLIC_SITE_URL=https://your-studio-domain.com

# Vercel OAuth
VERCEL_CLIENT_ID=your_client_id
VERCEL_CLIENT_SECRET=your_client_secret

# Database
POSTGRES_HOST=your-db-host
POSTGRES_PASSWORD=your-db-password
```

### 6.2 Domain Configuration

Ensure your custom domain is configured:
- Domain: `your-studio-domain.com`
- Redirects to: Vercel deployment URL

---

## Step 7: Create the Deploy Button

### 7.1 Deploy Button URL Format

```
https://vercel.com/new? integrations=your-indobase-integration
```

### 7.2 Embed Code Examples

**Markdown Badge:**
```markdown
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new? integrations=your-indobase-integration)
```

**HTML Button:**
```html
<a href="https://vercel.com/new? integrations=your-indobase-integration">
  <img src="https://vercel.com/button" alt="Deploy with Indobase" />
</a>
```

**HTML Link:**
```html
<a href="https://vercel.com/new? integrations=your-indobase-integration"
   style="display:inline-flex;align-items:center;padding:12px 24px;
          background:#000;color:#fff;border-radius:8px;text-decoration:none;">
  Deploy with Indobase
</a>
```

### 7.3 Add to Your Website

Place the Deploy Button on:
- [ ] Landing page
- [ ] Documentation
- [ ] GitHub README
- [ ] Marketing emails

---

## Step 8: Test the Integration

### 8.1 Test Deploy Button Flow

1. Go to `https://vercel.com/integrations/your-indobase-integration`
2. Click **"Deploy Button"**
3. Click **"Add to Project"**
4. Select or create a Vercel team
5. Authenticate with your Indobase account
6. Select an organization
7. Verify project is created with environment variables

### 8.2 Test Marketplace Flow

1. Go to `https://vercel.com/integrations`
2. Search for "Indobase"
3. Click **"Add Integration"**
4. Select a Vercel project
5. Connect to your Indobase organization
6. Verify environment variables are synced

### 8.3 Verify Environment Variables

After connection, check these variables are set in Vercel:

```
POSTGRES_URL
POSTGRES_PRISMA_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE
SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| OAuth redirect URL mismatch | Verify URLs match exactly in Vercel dashboard |
| Integration not appearing | Check `NEXT_PUBLIC_SITE_URL` is correctly set |
| Env vars not syncing | Verify `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET` |
| Project creation fails | Check database connection and permissions |

### Debug Steps

1. **Check browser console** for JavaScript errors
2. **Check server logs** for API errors
3. **Verify environment variables** are correctly set
4. **Test OAuth flow** with incognito window

---

## Security Considerations

- [ ] Never expose `VERCEL_CLIENT_SECRET` to client-side code
- [ ] Use HTTPS for all production URLs
- [ ] Validate OAuth state parameter to prevent CSRF
- [ ] Store tokens encrypted in database
- [ ] Implement proper organization-level permissions

---

## API Reference

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /integrations/vercel/install` | Start OAuth flow |
| `GET /integrations/vercel/callback` | OAuth callback |
| `POST /api/integrations/vercel/connections` | Create project connection |
| `DELETE /api/integrations/vercel/connections/:id` | Remove connection |

### Vercel API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /v2/oauth/access_token` | Get OAuth access token |
| `GET /v1/projects` | List Vercel projects |
| `GET /v1/projects/:id/env` | Get project environment variables |
| `PATCH /v1/projects/:id/env` | Update project environment variables |

---

## Support Resources

- **Vercel Integration Docs**: https://vercel.com/docs/integrations
- **Deploy Button Guide**: https://vercel.com/docs/integrations/create-integration#deploy-button
- **OAuth Flow**: https://vercel.com/docs/integrations/create-integration#oauth-20
- **Vercel API**: https://vercel.com/docs/api

---

## Next Steps

After setup, your customers can:

1. Click **"Deploy to Indobase"** on Vercel
2. Authenticate with their Indobase account
3. Select or create an organization
4. Have projects automatically created with database and auth configured
5. Environment variables synced automatically

---

*Document generated for Indobase SaaS setup*
*Last updated: 2026-05-10*
