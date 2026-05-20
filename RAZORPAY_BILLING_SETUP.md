# Razorpay billing (Indobase SaaS)

Studio uses **Razorpay Subscriptions** for organization billing (INR, UPI/cards/netbanking). Stripe Elements are bypassed when Razorpay is configured.

## 1. Razorpay Dashboard

1. Create a [Razorpay account](https://razorpay.com/) (test mode first).
2. **Settings → API Keys** — note Key ID and Key Secret.
3. **Settings → Webhooks** — add endpoint:
   ```
   https://studio.indobase.in/api/platform/razorpay/webhook
   ```
   Enable events:
   - `subscription.authenticated`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
   - `subscription.halted`
   - `subscription.completed`
4. Copy the **Webhook secret**.

### Optional: pre-created plans

Create monthly plans in Razorpay and set on Studio:

```env
RAZORPAY_PLAN_ID_PRO=plan_xxxx
RAZORPAY_PLAN_ID_TEAM=plan_xxxx
```

If omitted, Studio creates plans automatically from **effective** INR prices (`resolveIndobasePlanPriceInr`: defaults ₹2499 Pro, ₹49999 Business, overridable via `INDOBASE_PRO_PLAN_PRICE_INR` / `INDOBASE_TEAM_PLAN_PRICE_INR` on Studio).

See `docker/docs/INDOBASE_PRICING_MODEL.md`.

## 2. Studio environment

```env
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxx

NEXT_PUBLIC_RAZORPAY_BILLING=true
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx
```

Server-only: `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.  
Client: `NEXT_PUBLIC_RAZORPAY_BILLING=true` enables Razorpay UI instead of Stripe.

## 3. VPS (Swarm)

```bash
STUDIO_SVC=$(docker service ls --format '{{.Name}}' | grep indobase-studio | head -1)
docker service update \
  --env-add "RAZORPAY_KEY_ID=rzp_live_xxx" \
  --env-add "RAZORPAY_KEY_SECRET=xxx" \
  --env-add "RAZORPAY_WEBHOOK_SECRET=xxx" \
  --env-add "NEXT_PUBLIC_RAZORPAY_BILLING=true" \
  --env-add "NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxx" \
  "$STUDIO_SVC"
```

Rebuild/deploy Studio so `NEXT_PUBLIC_*` are baked into the image, or set them at runtime as above.

## 4. Flows

| Flow | Behavior |
|------|----------|
| New org (Pro/Team) | Org created on Free → Razorpay checkout → webhook activates plan |
| Change plan | Opens Razorpay hosted checkout |
| Downgrade to Free | Cancels Razorpay subscription in API |

## 5. Verify

```bash
curl -sS https://studio.indobase.in/api/platform/billing/plans | jq '.currency'
# "INR"
```

Test upgrade in **Organization → Billing → Change subscription plan**.
