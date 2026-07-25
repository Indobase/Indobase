# Indobase Email — sending, providers, DNS

Indobase Email (`indobase-email/`, Notifuse fork) has **two** sending layers.
Both must be configured before campaigns and transactional messages deliver.

| Layer | Purpose | Where configured |
|---|---|---|
| **System SMTP** | App emails: workspace invites, magic codes (if enabled), circuit-breaker alerts | Host env (`SMTP_*`) or Email console → System settings |
| **Workspace providers** | Marketing broadcasts + transactional notifications for a project workspace | Email console → **Settings → Integrations** (per workspace) |

`GET /api/setup.status` → `smtp_configured` reflects **system** env only
(`SMTP_HOST` + `SMTP_PORT` + `SMTP_FROM_EMAIL`, or `SMTP_MAILER=console` +
`SMTP_FROM_EMAIL`). It does **not** mean workspace campaigns are ready.

Studio Marketing hub / SSO: see [MARKETING.md](./MARKETING.md).

---

## Recommended default: Amazon SES (Mumbai)

India-focused / DPDP: use **Amazon SES in `ap-south-1` (Mumbai)** for both layers.

| Use | Mechanism | Region endpoint |
|---|---|---|
| System SMTP | SES **SMTP interface** | `email-smtp.ap-south-1.amazonaws.com:587` (STARTTLS) |
| Workspace campaigns | SES **API** integration in console | Region `ap-south-1` |

Other Notifuse-native providers work in the same Integrations UI: **SMTP,
Mailgun, Postmark, SparkPost, Mailjet, SendGrid**.

---

## 1. System SMTP (go live checklist)

### Secrets to put in host `.env` (never commit)

On the deploy host (`/opt/indobase-email/docker/deploy/.env`):

```bash
SMTP_MAILER=smtp
SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=<SES SMTP username from AWS>
SMTP_PASSWORD=<SES SMTP password from AWS>
SMTP_FROM_EMAIL=noreply@your-verified-domain.com
SMTP_FROM_NAME=Indobase Email
SMTP_USE_TLS=true
```

Create SMTP credentials: AWS Console → **SES** → region **Asia Pacific (Mumbai)**
→ **SMTP settings** → Create SMTP credentials (IAM user).

Smoke without an ESP (logs only, no delivery):

```bash
SMTP_MAILER=console
SMTP_FROM_EMAIL=noreply@indobase.in
```

Then `curl -sS https://email.indobase.fun/api/setup.status` should show
`"smtp_configured":true`. Switch back to `SMTP_MAILER=smtp` + real SES SMTP
before production traffic.

Redeploy after editing `.env`:

```bash
cd /opt/indobase-email
docker compose -f docker/deploy/docker-compose.yml --env-file docker/deploy/.env up -d
```

Compose already passes `SMTP_*` into `email-api` (see
`indobase-email/docker/deploy/docker-compose.yml`).

---

## 2. Workspace sending (campaigns / transactional)

1. Studio → project → **Marketing** → **Open Email** (SSO).
2. **Settings → Integrations → Add** → **Amazon SES** (recommended).
3. Region: **`ap-south-1`** (Mumbai). Paste IAM access key + secret with
   `ses:SendEmail` / `ses:SendRawEmail` (and config-set permissions if used).
4. Add at least one **sender** (verified identity in SES).
5. Set the integration **Use for Marketing** and/or **Use for Transactional**.
6. Use **Test** in the integration card before sending a campaign.

Alternate: choose **SMTP** and point at the same SES SMTP host, or another ESP
(Mailgun / Postmark / SparkPost / Mailjet / SendGrid).

---

## 3. Domain / DNS (SPF, DKIM, DMARC)

In **SES → Verified identities** for your sending domain (or email address):

1. Verify the domain (or single address) in `ap-south-1`.
2. Publish the **DKIM CNAME** records SES shows.
3. **SPF** (example — merge with existing TXT if present):

   ```text
   v=spf1 include:amazonses.com ~all
   ```

4. **DMARC** (start with monitoring):

   ```text
   _dmarc.yourdomain.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"
   ```

5. Leave SES out of the sandbox (request production access) before bulk send.
6. Optional: custom MAIL FROM / feedback notifications in SES.

Until the identity is verified and (for volume) production access is granted,
SES rejects or heavily limits delivery.

---

## 4. Env reference (system)

| Variable | Required for send | Notes |
|---|---|---|
| `SMTP_MAILER` | no | `smtp` (default) or `console` |
| `SMTP_HOST` | yes (smtp) | SES: `email-smtp.ap-south-1.amazonaws.com` |
| `SMTP_PORT` | yes (smtp) | `587` |
| `SMTP_USERNAME` | usually | SES SMTP user |
| `SMTP_PASSWORD` | usually | SES SMTP password |
| `SMTP_FROM_EMAIL` | yes | Must be a SES-verified identity |
| `SMTP_FROM_NAME` | no | Default `Indobase Email` |
| `SMTP_USE_TLS` | no | Default on unless `false` |
| `SMTP_EHLO_HOSTNAME` | no | Optional EHLO |

Workspace provider credentials live encrypted in the Email DB (per integration),
not in compose env.

---

## 5. Verify

```bash
curl -sS https://email.indobase.fun/healthz
curl -sS https://email.indobase.fun/api/setup.status
# expect smtp_configured:true after system SMTP env is filled

# After workspace SES integration + Test email succeeds, send a draft campaign
# to yourself before opening the audience.
```

---

## Compliance note

Audience and message data in Indobase Email are subject to India **DPDP**. Prefer
Mumbai (`ap-south-1`) so SES processing stays in-region when possible; confirm
AWS data residency for your account and any subprocessors you enable.
