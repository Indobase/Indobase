//! India settlements inbound webhooks (Razorpay Recurring / Route).
//!
//! Signature: HMAC-SHA256 over raw body — https://razorpay.com/docs/webhooks/validate-test/
//! Payload: https://razorpay.com/docs/webhooks/payloads/payments/
//! Settles payment.captured / payment.failed via consolidate_intent_and_transaction_tx.
//! Mandate auth (notes.indobase.purpose=mandate_auth) upserts the token as a payment method.

use error_stack::Report;
use hyper::StatusCode;
use secrecy::{ExposeSecret, SecretString};

use super::types::{AdapterCommon, ParsedRequest, WebhookAdapter};
use crate::errors;
use axum::response::IntoResponse;
use common_domain::actor::Actor;
use common_domain::ids::{
    BaseId, CustomerConnectionId, CustomerId, CustomerPaymentMethodId, PaymentTransactionId,
};
use error_stack::ResultExt;
use hmac::{Hmac, KeyInit, Mac};
use meteroid_store::Store;
use meteroid_store::adapters::payment_service_providers::payment_to_intent;
use meteroid_store::domain::connectors::Connector;
use meteroid_store::domain::{CustomerPaymentMethodNew, PaymentIntent};
use meteroid_store::domain::enums::PaymentMethodTypeEnum;
use meteroid_store::repositories::CustomersInterface;
use meteroid_store::repositories::customer_payment_methods::CustomerPaymentMethodsInterface;
use meteroid_store::repositories::payment_transactions::PaymentTransactionInterface;
use razorpay_client::{parse_event, Payment as RzPayment};
use scoped_futures::ScopedFutureExt;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Default)]
pub struct Razorpay {}

impl AdapterCommon for Razorpay {
    fn id(&self) -> &'static str {
        "razorpay"
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn verify_razorpay_signature(raw_body: &[u8], signature: &str, secret: &str) -> bool {
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(raw_body);
    let expected = hex::encode(mac.finalize().into_bytes());
    constant_time_eq(expected.as_bytes(), signature.as_bytes())
}

fn note_str(notes: &Option<serde_json::Value>, key: &str) -> Option<String> {
    let obj = notes.as_ref()?.as_object()?;
    obj.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn payment_entity_from_payload(payload: &serde_json::Value) -> Option<RzPayment> {
    let entity = payload.get("payment")?.get("entity")?;
    serde_json::from_value(entity.clone()).ok()
}

#[async_trait::async_trait]
impl WebhookAdapter for Razorpay {
    async fn verify_webhook(
        &self,
        request: &ParsedRequest,
        security: &SecretString,
    ) -> Result<bool, Report<errors::AdapterWebhookError>> {
        let sig = request
            .headers
            .get("X-Razorpay-Signature")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| Report::new(errors::AdapterWebhookError::SignatureNotFound))?;

        let ok = verify_razorpay_signature(&request.raw_body, sig, security.expose_secret());
        if !ok {
            return Err(Report::new(
                errors::AdapterWebhookError::SignatureVerificationFailed,
            ));
        }
        Ok(true)
    }

    fn get_optimistic_webhook_response(&self) -> axum::response::Response {
        (StatusCode::OK, "OK").into_response()
    }

    async fn process_webhook_event(
        &self,
        request: &ParsedRequest,
        connector: &Connector,
        store: Store,
    ) -> Result<bool, Report<errors::AdapterWebhookError>> {
        let body = String::from_utf8_lossy(&request.raw_body);
        let event = parse_event(&body)
            .change_context(errors::AdapterWebhookError::BodyDecodingFailed)?;

        log::info!("Processing India settlements webhook: {}", event.event);

        match event.event.as_str() {
            "payment.captured" | "payment.failed" | "payment.authorized" => {
                let payment = payment_entity_from_payload(&event.payload).ok_or_else(|| {
                    Report::new(errors::AdapterWebhookError::BodyDecodingFailed)
                })?;

                // Mandate / token registration path (setup intent equivalent).
                let purpose = note_str(&payment.notes, "indobase.purpose")
                    .or_else(|| note_str(&payment.notes, "meteroid.purpose"));
                if purpose.as_deref() == Some("mandate_auth")
                    && payment.status.eq_ignore_ascii_case("captured")
                {
                    return self
                        .process_mandate_auth(&payment, connector, store)
                        .await;
                }

                // Recurring / one-shot charge settle.
                if event.event == "payment.authorized" {
                    // Wait for captured / failed for settle; authorized alone is noisy.
                    log::info!("Ignoring payment.authorized for settle (await capture)");
                    return Ok(false);
                }

                let transaction_id = note_str(&payment.notes, "indobase.transaction_id")
                    .or_else(|| note_str(&payment.notes, "meteroid.transaction_id"))
                    .ok_or_else(|| {
                        Report::new(errors::AdapterWebhookError::MissingMetadata(
                            "indobase.transaction_id".to_string(),
                        ))
                    })?;
                let transaction_id = PaymentTransactionId::parse_base62(&transaction_id)
                    .change_context(errors::AdapterWebhookError::InvalidMetadata)?;

                let intent: PaymentIntent = payment_to_intent(
                    payment,
                    connector.tenant_id,
                    transaction_id,
                )
                .change_context(errors::AdapterWebhookError::ProviderError)?;

                store
                    .transaction(|conn| {
                        let store = store.clone();
                        async move {
                            let inserted_transaction = store
                                .get_payment_tx_by_id_for_update(
                                    conn,
                                    intent.transaction_id,
                                    intent.tenant_id,
                                )
                                .await?;

                            store
                                .consolidate_intent_and_transaction_tx(
                                    conn,
                                    &Actor::System,
                                    inserted_transaction,
                                    intent,
                                )
                                .await?;

                            Ok(())
                        }
                        .scope_boxed()
                    })
                    .await
                    .change_context(errors::AdapterWebhookError::StoreError)?;

                Ok(true)
            }
            other => {
                log::info!("Ignoring India settlements webhook event: {other}");
                Ok(false)
            }
        }
    }
}

impl Razorpay {
    async fn process_mandate_auth(
        &self,
        payment: &RzPayment,
        connector: &Connector,
        store: Store,
    ) -> Result<bool, Report<errors::AdapterWebhookError>> {
        let connection_id = note_str(&payment.notes, "indobase.connection_id")
            .or_else(|| note_str(&payment.notes, "meteroid.connection_id"))
            .ok_or_else(|| {
                Report::new(errors::AdapterWebhookError::MissingMetadata(
                    "indobase.connection_id".to_string(),
                ))
            })?;
        let connection_id = CustomerConnectionId::parse_base62(&connection_id)
            .change_context(errors::AdapterWebhookError::InvalidMetadata)?;

        let customer_id = note_str(&payment.notes, "indobase.customer_id")
            .or_else(|| note_str(&payment.notes, "meteroid.customer_id"))
            .ok_or_else(|| {
                Report::new(errors::AdapterWebhookError::MissingMetadata(
                    "indobase.customer_id".to_string(),
                ))
            })?;
        let customer_id = CustomerId::parse_base62(&customer_id)
            .change_context(errors::AdapterWebhookError::InvalidMetadata)?;

        let token_id = payment.token_id.clone().ok_or_else(|| {
            Report::new(errors::AdapterWebhookError::MissingMetadata(
                "token_id".to_string(),
            ))
        })?;

        let method = payment.method.as_deref().unwrap_or("card");
        let payment_method_type = match method {
            "upi" | "emandate" | "nach" => PaymentMethodTypeEnum::DirectDebitSepa,
            _ => PaymentMethodTypeEnum::Card,
        };

        let payment_method = store
            .upsert_payment_method(CustomerPaymentMethodNew {
                id: CustomerPaymentMethodId::new(),
                tenant_id: connector.tenant_id,
                customer_id,
                connection_id,
                external_payment_method_id: token_id,
                payment_method_type,
                account_number_hint: None,
                card_brand: payment.card.as_ref().and_then(|c| c.network.clone()),
                card_last4: payment.card.as_ref().and_then(|c| c.last4.clone()),
                card_exp_month: None,
                card_exp_year: None,
            })
            .await
            .change_context(errors::AdapterWebhookError::StoreError)?;

        use meteroid_store::domain::CustomerPatch;
        let customer_patch = CustomerPatch {
            id: customer_id,
            name: None,
            alias: None,
            billing_email: None,
            phone: None,
            balance_value_cents: None,
            currency: None,
            billing_address: None,
            shipping_address: None,
            invoicing_entity_id: None,
            vat_number: None,
            current_payment_method_id: Some(Some(payment_method.id)),
            invoicing_emails: None,
            is_tax_exempt: None,
            custom_taxes: None,
            connected_account_id: None,
        };

        store
            .patch_customer(Actor::System, connector.tenant_id, customer_patch)
            .await
            .change_context(errors::AdapterWebhookError::StoreError)?;

        Ok(true)
    }
}

impl crate::adapters::types::Adapter for Razorpay {}

#[cfg(test)]
mod tests {
    use super::verify_razorpay_signature;
    use hmac::{Hmac, KeyInit, Mac};
    use sha2::Sha256;

    #[test]
    fn verifies_hmac_hex_signature() {
        let body = br#"{"event":"payment.captured"}"#;
        let secret = "whsec_test";
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let sig = hex::encode(mac.finalize().into_bytes());
        assert!(verify_razorpay_signature(body, &sig, secret));
        assert!(!verify_razorpay_signature(body, "deadbeef", secret));
    }
}
