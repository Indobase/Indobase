use crate::domain::connectors::{Connector, MockPublicData, ProviderData, ProviderSensitiveData};
use crate::domain::customer_payment_methods::SetupIntent;
use crate::domain::enums::ConnectorProviderEnum;
use crate::domain::payment_transactions::PaymentIntent;
use crate::domain::{
    Address, Customer, CustomerConnection, CustomerPaymentMethodFromProvider, PaymentMethodTypeEnum,
};
use crate::utils::local_id::LocalId;
use async_trait::async_trait;
use common_domain::ids::{BaseId, PaymentTransactionId, TenantId};
use diesel_models::enums::PaymentStatusEnum;
use error_stack::{Report, ResultExt, bail};
use secrecy::SecretString;
use std::collections::HashMap;
use stripe_client::client::StripeClient;
use stripe_client::customers::{
    CreateCustomer, CustomerApi, CustomerShipping, OptionalFieldsAddress,
};
use stripe_client::payment_intents::{
    PaymentIntentApi, PaymentIntentRequest, StripePaymentIntent, StripePaymentStatus,
};
use stripe_client::payment_methods::PaymentMethodsApi;
use stripe_client::setup_intents::{
    CreateSetupIntent, CreateSetupIntentUsage, SetupIntentApi, StripePaymentMethodType,
};
use razorpay_client::RazorpayClient;
use razorpay_client::{
    CreateCustomerRequest as RzCreateCustomer, CreateOrderRequest, CreateRecurringPaymentRequest,
    IndiaAuthCheckoutPayload, Payment as RzPayment,
};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum PaymentProviderError {
    #[error("Provider configuration error: {0}")]
    Configuration(String),
    #[error("Customer creation failed: {0}")]
    CustomerCreation(String),
    #[error("Setup Intent error: {0}")]
    SetupIntent(String),
    #[error("Payment Intent error: {0}")]
    PaymentIntent(String),
    #[error("Database error: {0}")]
    Database(#[from] diesel::result::Error),
    #[error("Missing metadata: {0}")]
    MissingMetadata(String),
    #[error("Invalid metadata")]
    InvalidMetadata,
}

#[async_trait]
pub trait PaymentProvider: Send + Sync {
    async fn create_customer_in_provider(
        &self,
        customer: &Customer,
        connector: &Connector,
    ) -> Result<String, Report<PaymentProviderError>>;
    async fn get_payment_method_from_provider(
        &self,
        connector: &Connector,
        payment_method_id: &str,
        customer_id: &str,
    ) -> Result<CustomerPaymentMethodFromProvider, Report<PaymentProviderError>>;
    async fn create_setup_intent_in_provider(
        &self,
        connection: &CustomerConnection,
        connector: &Connector,
        payment_methods: Vec<PaymentMethodTypeEnum>,
    ) -> Result<SetupIntent, Report<PaymentProviderError>>;

    #[allow(clippy::too_many_arguments)]
    async fn create_payment_intent_in_provider(
        &self,
        connector: &Connector,
        transaction_id: &PaymentTransactionId,
        customer_external_id: &str,
        payment_method_external_id: &str,
        payment_method_type: &PaymentMethodTypeEnum,
        amount: i64,
        currency: &str,
    ) -> Result<PaymentIntent, Report<PaymentProviderError>>;
}

pub fn initialize_payment_provider(
    config: &Connector,
) -> Result<Box<dyn PaymentProvider>, Report<PaymentProviderError>> {
    match config.provider {
        ConnectorProviderEnum::Stripe => Ok(Box::new(StripeClient::new())),
        ConnectorProviderEnum::Mock => {
            let mock_config = match &config.data {
                Some(ProviderData::Mock(data)) => data.clone(),
                _ => MockPublicData::default(),
            };
            Ok(Box::new(MockPaymentProvider::new(mock_config)))
        }
        ConnectorProviderEnum::Razorpay => Ok(Box::new(RazorpayClient::new())),
        _ => bail!(PaymentProviderError::Configuration(
            "unknown payment provider".to_owned()
        )),
    }
}

#[async_trait::async_trait]
impl PaymentProvider for StripeClient {
    async fn create_customer_in_provider(
        &self,
        customer: &Customer,
        connector: &Connector,
    ) -> Result<String, Report<PaymentProviderError>> {
        let secret_key = extract_stripe_secret_key(connector)?;
        fn map_address(a: &Address) -> OptionalFieldsAddress {
            OptionalFieldsAddress {
                city: a.city.clone(),
                country: a.country.clone(),
                line1: a.line1.clone(),
                line2: a.line2.clone(),
                state: a.state.clone(),
                postal_code: a.zip_code.clone(),
            }
        }

        // add instance (org, tenant slug ?)
        let mut metadata = HashMap::from([
            ("meteroid.id".to_string(), customer.id.as_base62()),
            (
                "meteroid.tenant_id".to_string(),
                customer.tenant_id.as_base62(),
            ),
        ]);

        if let Some(alias) = &customer.alias {
            metadata.insert("meteroid.alias".to_string(), alias.clone().to_string());
        }

        let res = self
            .create_customer(
                CreateCustomer {
                    name: Some(customer.name.clone()),
                    address: customer.billing_address.as_ref().map(map_address),
                    email: customer.billing_email.clone(),
                    source: None, // drop, not what I expected
                    shipping: customer
                        .shipping_address
                        .as_ref()
                        .and_then(|a| a.address.as_ref())
                        .map(|a| CustomerShipping {
                            address: map_address(a),
                            name: customer.name.clone(),
                            phone: customer.phone.clone(),
                        }),
                    metadata: Some(metadata),
                    phone: customer.phone.clone(),
                    description: None,
                    preferred_locales: None,
                    validate: None,
                    coupon: None,
                },
                &secret_key,
                LocalId::no_prefix(), //customer.local_id.clone(),
            )
            .await
            .map_err(|e| PaymentProviderError::CustomerCreation(e.to_string()))?;

        Ok(res.id)
    }

    async fn get_payment_method_from_provider(
        &self,
        connector: &Connector,
        payment_method_id: &str,
        customer_id: &str,
    ) -> Result<CustomerPaymentMethodFromProvider, Report<PaymentProviderError>> {
        let secret_key = extract_stripe_secret_key(connector)?;

        let method = self
            .get_payment_method(payment_method_id, customer_id, &secret_key)
            .await
            .map_err(|e| Report::new(PaymentProviderError::Configuration(e.to_string())))?;

        let account_number_hint = match method._type {
            stripe_client::payment_methods::StripePaymentMethodType::BacsDebit => {
                method.bacs_debit.and_then(|acc| acc.last4)
            }
            stripe_client::payment_methods::StripePaymentMethodType::Card => None,
            stripe_client::payment_methods::StripePaymentMethodType::SepaDebit => {
                method.bacs_debit.and_then(|acc| acc.last4)
            }
            stripe_client::payment_methods::StripePaymentMethodType::UsBankAccount => {
                method.bacs_debit.and_then(|acc| acc.last4)
            }
        };

        let payment_method_type = match method._type {
            stripe_client::payment_methods::StripePaymentMethodType::BacsDebit => {
                PaymentMethodTypeEnum::DirectDebitBacs
            }
            stripe_client::payment_methods::StripePaymentMethodType::Card => {
                PaymentMethodTypeEnum::Card
            }
            stripe_client::payment_methods::StripePaymentMethodType::SepaDebit => {
                PaymentMethodTypeEnum::DirectDebitSepa
            }
            stripe_client::payment_methods::StripePaymentMethodType::UsBankAccount => {
                PaymentMethodTypeEnum::DirectDebitAch
            }
        };

        let (card_brand, card_last4, card_exp_month, card_exp_year) = match method._type {
            stripe_client::payment_methods::StripePaymentMethodType::Card => {
                if let Some(card) = &method.card {
                    (
                        Some(card.brand.clone()),
                        card.last4.clone(),
                        Some(card.exp_month),
                        Some(card.exp_year),
                    )
                } else {
                    (None, None, None, None)
                }
            }
            _ => (None, None, None, None),
        };

        Ok(CustomerPaymentMethodFromProvider {
            external_payment_method_id: method.id,
            payment_method_type,
            account_number_hint,
            card_brand,
            card_last4,
            card_exp_month,
            card_exp_year,
        })
    }

    async fn create_setup_intent_in_provider(
        &self,
        connection: &CustomerConnection,
        connector: &Connector,
        payment_methods: Vec<PaymentMethodTypeEnum>,
    ) -> Result<SetupIntent, Report<PaymentProviderError>> {
        let secret_key = extract_stripe_secret_key(connector)?;
        let public_key = extract_stripe_public_key(connector)?;

        let stripe_payment_methods = payment_methods
            .into_iter()
            .filter_map(|method| (&method).into())
            .collect();

        let metadata = HashMap::from([
            (
                "meteroid.tenant_id".to_string(),
                connector.tenant_id.as_base62(),
            ),
            (
                "meteroid.customer_id".to_string(),
                connection.customer_id.as_base62(),
            ),
            (
                "meteroid.connection_id".to_string(),
                connection.id.as_base62(),
            ),
        ]);

        let setup_intent = self
            .create_setup_intent(
                CreateSetupIntent {
                    customer: Some(connection.external_customer_id.clone()),
                    payment_method_types: Some(stripe_payment_methods),
                    usage: Some(CreateSetupIntentUsage::OffSession),
                    setup_mandate_details: None,
                    metadata,
                },
                &secret_key,
                Uuid::now_v7().to_string(), // TODO pass idempotency from api (though we already do check idp at the api level)
            )
            .await
            .map_err(|e| PaymentProviderError::SetupIntent(e.to_string()))?;

        Ok(SetupIntent {
            intent_id: setup_intent.id,
            client_secret: setup_intent.client_secret,
            public_key,
            provider: ConnectorProviderEnum::Stripe,
            connector_id: connector.id,
            connection_id: connection.id,
        })
    }

    async fn create_payment_intent_in_provider(
        &self,
        connector: &Connector,
        transaction_id: &PaymentTransactionId,
        customer_external_id: &str,
        payment_method_external_id: &str,
        payment_method_type: &PaymentMethodTypeEnum,
        amount: i64,
        currency: &str,
    ) -> Result<PaymentIntent, Report<PaymentProviderError>> {
        let secret_key = extract_stripe_secret_key(connector)?;

        let metadata = HashMap::from([
            (
                "meteroid.tenant_id".to_string(),
                connector.tenant_id.as_base62(),
            ),
            (
                "meteroid.transaction_id".to_string(),
                transaction_id.as_base62(),
            ),
        ]);

        let payment_method_type: Option<StripePaymentMethodType> = payment_method_type.into();

        let payment_intent = self
            .create_payment_intent(
                PaymentIntentRequest {
                    amount,
                    currency: currency.to_string(),
                    customer: Some(customer_external_id.to_string()),
                    setup_mandate_details: None,
                    payment_method: payment_method_external_id.to_string(),
                    confirm: true,
                    metadata,
                    off_session: Some(true),
                    return_url: None,
                    capture_method: Default::default(),
                    // allowed
                    payment_method_types: payment_method_type.into_iter().collect(),
                },
                &secret_key,
                Uuid::now_v7().to_string(), // TODO pass idempotency from api ?
            )
            .await
            .map_err(|e| PaymentProviderError::PaymentIntent(e.to_string()))?;

        Ok(payment_intent.try_into()?)
    }
}

impl TryFrom<StripePaymentIntent> for PaymentIntent {
    type Error = Report<PaymentProviderError>;

    fn try_from(intent: StripePaymentIntent) -> Result<Self, Self::Error> {
        let tenant_id = intent
            .metadata
            .get("meteroid.tenant_id")
            // TODO search :  .get("customer_id")
            .ok_or(PaymentProviderError::MissingMetadata(
                "meteroid.tenant_id".to_string(),
            ))?;
        let tenant_id = TenantId::parse_base62(tenant_id)
            .change_context(PaymentProviderError::InvalidMetadata)?;

        let transaction_id = intent.metadata.get("meteroid.transaction_id").ok_or(
            PaymentProviderError::MissingMetadata("meteroid.transaction_id".to_string()),
        )?;
        let transaction_id = PaymentTransactionId::parse_base62(transaction_id)
            .change_context(PaymentProviderError::InvalidMetadata)?;

        let (new_status, processed_at) = match intent.status {
            StripePaymentStatus::Succeeded => (
                PaymentStatusEnum::Settled,
                Some(chrono::Utc::now().naive_utc()),
            ),
            StripePaymentStatus::Failed => (PaymentStatusEnum::Failed, None),
            StripePaymentStatus::Canceled => (PaymentStatusEnum::Cancelled, None),
            StripePaymentStatus::Pending | StripePaymentStatus::Processing => {
                (PaymentStatusEnum::Pending, None)
            }
            StripePaymentStatus::RequiresCustomerAction
            | StripePaymentStatus::RequiresPaymentMethod
            | StripePaymentStatus::RequiresConfirmation
            | StripePaymentStatus::RequiresCapture => {
                // Customer action is required - keep as Pending but we might want to notify the customer
                tracing::log::info!(
                    "Payment intent {} requires customer action: {:?}",
                    intent.id,
                    intent.status
                );
                (PaymentStatusEnum::Pending, None)
            }
            StripePaymentStatus::Chargeable | StripePaymentStatus::Consumed => {
                tracing::log::warn!(
                    "Unhandled stripe payment status for transaction {}: {:?}",
                    intent.id,
                    intent.status
                );
                return Err(Report::new(PaymentProviderError::PaymentIntent(format!(
                    "Unhandled payment status: {:?}",
                    intent.status
                ))));
            }
        };

        Ok(PaymentIntent {
            external_id: intent.id,
            amount_requested: intent.amount,
            amount_received: intent.amount_received,
            currency: intent.currency,
            next_action: intent.next_action,
            status: new_status.into(),
            processed_at,
            last_payment_error: intent.last_payment_error,
            tenant_id,
            transaction_id,
        })
    }
}

fn extract_stripe_secret_key(
    connector: &Connector,
) -> Result<SecretString, Report<PaymentProviderError>> {
    match &connector.sensitive {
        Some(ProviderSensitiveData::Stripe(data)) => {
            Ok(SecretString::from(data.api_secret_key.clone()))
        }
        Some(_) => Err(Report::new(PaymentProviderError::Configuration(
            "Not a stripe connector".to_string(),
        ))),
        None => Err(Report::new(PaymentProviderError::Configuration(
            "No api_secret_key found".to_string(),
        ))),
    }
}

fn extract_stripe_public_key(
    connector: &Connector,
) -> Result<SecretString, Report<PaymentProviderError>> {
    match &connector.data {
        Some(ProviderData::Stripe(data)) => {
            Ok(SecretString::from(data.api_publishable_key.clone()))
        }
        Some(_) => Err(Report::new(PaymentProviderError::Configuration(
            "not a stripe connection".to_string(),
        ))),
        None => Err(Report::new(PaymentProviderError::Configuration(
            "No api_publishable_key found".to_string(),
        ))),
    }
}

fn extract_razorpay_keys(
    connector: &Connector,
) -> Result<(String, SecretString), Report<PaymentProviderError>> {
    let key_id = match &connector.data {
        Some(ProviderData::Razorpay(data)) => data.key_id.clone(),
        _ => {
            return Err(Report::new(PaymentProviderError::Configuration(
                "Not an India settlements connector".to_string(),
            )));
        }
    };
    let key_secret = match &connector.sensitive {
        Some(ProviderSensitiveData::Razorpay(data)) => {
            SecretString::from(data.key_secret.clone())
        }
        _ => {
            return Err(Report::new(PaymentProviderError::Configuration(
                "Missing India settlements key secret".to_string(),
            )));
        }
    };
    Ok((key_id, key_secret))
}

#[async_trait::async_trait]
impl PaymentProvider for RazorpayClient {
    async fn create_customer_in_provider(
        &self,
        customer: &Customer,
        connector: &Connector,
    ) -> Result<String, Report<PaymentProviderError>> {
        let (key_id, key_secret) = extract_razorpay_keys(connector)?;
        let mut notes = HashMap::from([
            ("indobase.id".to_string(), customer.id.as_base62()),
            (
                "indobase.tenant_id".to_string(),
                customer.tenant_id.as_base62(),
            ),
        ]);
        if let Some(alias) = &customer.alias {
            notes.insert("indobase.alias".to_string(), alias.clone());
        }

        let created = self
            .create_customer(
                &key_id,
                &key_secret,
                RzCreateCustomer {
                    name: Some(customer.name.clone()),
                    email: customer.billing_email.clone(),
                    contact: customer.phone.clone(),
                    fail_existing: Some("0".to_string()),
                    notes: Some(notes),
                },
            )
            .await
            .map_err(|e| PaymentProviderError::CustomerCreation(e.to_string()))?;

        Ok(created.id)
    }

    async fn get_payment_method_from_provider(
        &self,
        connector: &Connector,
        payment_method_id: &str,
        customer_id: &str,
    ) -> Result<CustomerPaymentMethodFromProvider, Report<PaymentProviderError>> {
        let (key_id, key_secret) = extract_razorpay_keys(connector)?;
        let token = self
            .get_token(&key_id, &key_secret, customer_id, payment_method_id)
            .await
            .map_err(|e| PaymentProviderError::PaymentIntent(e.to_string()))?;

        let method = token.method.as_deref().unwrap_or("card");
        let payment_method_type = match method {
            "upi" | "emandate" | "nach" => PaymentMethodTypeEnum::DirectDebitSepa, // closest domestic recurring bucket
            _ => PaymentMethodTypeEnum::Card,
        };

        Ok(CustomerPaymentMethodFromProvider {
            external_payment_method_id: token.id,
            payment_method_type,
            account_number_hint: None,
            card_brand: token.card.as_ref().and_then(|c| c.network.clone()),
            card_last4: token.card.as_ref().and_then(|c| c.last4.clone()),
            card_exp_month: None,
            card_exp_year: None,
        })
    }

    async fn create_setup_intent_in_provider(
        &self,
        connection: &CustomerConnection,
        connector: &Connector,
        _payment_methods: Vec<PaymentMethodTypeEnum>,
    ) -> Result<SetupIntent, Report<PaymentProviderError>> {
        let (key_id, key_secret) = extract_razorpay_keys(connector)?;

        // ₹1 auth order for mandate / token registration (amount in paise).
        let amount_paise = 100i64;
        let currency = "INR".to_string();
        let notes = HashMap::from([
            (
                "indobase.tenant_id".to_string(),
                connector.tenant_id.as_base62(),
            ),
            (
                "indobase.customer_id".to_string(),
                connection.customer_id.as_base62(),
            ),
            (
                "indobase.connection_id".to_string(),
                connection.id.as_base62(),
            ),
            ("indobase.purpose".to_string(), "mandate_auth".to_string()),
        ]);

        let order = self
            .create_order(
                &key_id,
                &key_secret,
                CreateOrderRequest {
                    amount: amount_paise,
                    currency: currency.clone(),
                    receipt: Some(format!("auth-{}", connection.id.as_base62())),
                    customer_id: Some(connection.external_customer_id.clone()),
                    payment_capture: Some(1),
                    notes: Some(notes),
                    method: None,
                    token: None,
                },
            )
            .await
            .map_err(|e| PaymentProviderError::SetupIntent(e.to_string()))?;

        let payload = IndiaAuthCheckoutPayload {
            order_id: order.id.clone(),
            customer_id: connection.external_customer_id.clone(),
            key_id: key_id.clone(),
            amount: amount_paise,
            currency,
            name: None,
            email: None,
            contact: None,
        };
        let client_secret = serde_json::to_string(&payload).map_err(|e| {
            PaymentProviderError::SetupIntent(format!("serialize checkout payload: {e}"))
        })?;

        Ok(SetupIntent {
            intent_id: order.id,
            client_secret,
            public_key: SecretString::from(key_id),
            provider: ConnectorProviderEnum::Razorpay,
            connector_id: connector.id,
            connection_id: connection.id,
        })
    }

    async fn create_payment_intent_in_provider(
        &self,
        connector: &Connector,
        transaction_id: &PaymentTransactionId,
        customer_external_id: &str,
        payment_method_external_id: &str,
        _payment_method_type: &PaymentMethodTypeEnum,
        amount: i64,
        currency: &str,
    ) -> Result<PaymentIntent, Report<PaymentProviderError>> {
        let (key_id, key_secret) = extract_razorpay_keys(connector)?;
        let currency = currency.to_uppercase();
        if currency != "INR" {
            return Err(Report::new(PaymentProviderError::PaymentIntent(
                "India settlements currently support INR only".to_string(),
            )));
        }

        let notes = HashMap::from([
            (
                "indobase.tenant_id".to_string(),
                connector.tenant_id.as_base62(),
            ),
            (
                "indobase.transaction_id".to_string(),
                transaction_id.as_base62(),
            ),
        ]);

        let order = self
            .create_order(
                &key_id,
                &key_secret,
                CreateOrderRequest {
                    amount,
                    currency: currency.clone(),
                    receipt: Some(transaction_id.as_base62()),
                    customer_id: Some(customer_external_id.to_string()),
                    payment_capture: Some(1),
                    notes: Some(notes.clone()),
                    method: None,
                    token: None,
                },
            )
            .await
            .map_err(|e| PaymentProviderError::PaymentIntent(e.to_string()))?;

        // Recurring API requires email + contact — prefer live customer from Razorpay.
        // https://razorpay.com/docs/api/payments/recurring-payments/
        let rz_customer = self
            .get_customer(&key_id, &key_secret, customer_external_id)
            .await
            .ok();
        let email = rz_customer
            .as_ref()
            .and_then(|c| c.email.clone())
            .filter(|e| !e.trim().is_empty())
            .unwrap_or_else(|| format!("{customer_external_id}@customers.indobase.payments"));
        let contact = rz_customer
            .as_ref()
            .and_then(|c| c.contact.clone())
            .map(|c| c.chars().filter(|ch| ch.is_ascii_digit()).collect::<String>())
            .filter(|c| c.len() >= 8)
            .unwrap_or_else(|| "9999999999".to_string());

        let payment = self
            .create_recurring_payment(
                &key_id,
                &key_secret,
                CreateRecurringPaymentRequest {
                    email,
                    contact,
                    amount,
                    currency: currency.clone(),
                    order_id: order.id,
                    customer_id: customer_external_id.to_string(),
                    token: payment_method_external_id.to_string(),
                    recurring: "1".to_string(),
                    notes: Some(notes),
                },
            )
            .await
            .map_err(|e| PaymentProviderError::PaymentIntent(e.to_string()))?;

        payment_to_intent(payment, connector.tenant_id, *transaction_id)
    }
}

pub fn payment_to_intent(
    payment: RzPayment,
    tenant_id: TenantId,
    transaction_id: PaymentTransactionId,
) -> Result<PaymentIntent, Report<PaymentProviderError>> {
    let status_str = payment.status.to_lowercase();
    let (new_status, processed_at) = match status_str.as_str() {
        "captured" | "authorized" => (
            PaymentStatusEnum::Settled,
            Some(chrono::Utc::now().naive_utc()),
        ),
        "failed" => (PaymentStatusEnum::Failed, None),
        "refunded" | "cancelled" | "canceled" => (PaymentStatusEnum::Cancelled, None),
        _ => (PaymentStatusEnum::Pending, None),
    };

    // Prefer notes for round-trip ids when present (webhook path).
    let notes_obj = payment.notes.as_ref().and_then(|n| n.as_object());
    let tenant_id = notes_obj
        .and_then(|n| {
            n.get("indobase.tenant_id")
                .or_else(|| n.get("meteroid.tenant_id"))
                .and_then(|v| v.as_str())
        })
        .and_then(|s| TenantId::parse_base62(s).ok())
        .unwrap_or(tenant_id);

    let transaction_id = notes_obj
        .and_then(|n| {
            n.get("indobase.transaction_id")
                .or_else(|| n.get("meteroid.transaction_id"))
                .and_then(|v| v.as_str())
        })
        .and_then(|s| PaymentTransactionId::parse_base62(s).ok())
        .unwrap_or(transaction_id);

    Ok(PaymentIntent {
        external_id: payment.id,
        amount_requested: payment.amount,
        amount_received: if matches!(new_status, PaymentStatusEnum::Settled) {
            Some(payment.amount)
        } else {
            None
        },
        currency: payment.currency,
        next_action: None,
        status: new_status.into(),
        processed_at,
        last_payment_error: payment.error_description,
        tenant_id,
        transaction_id,
    })
}

impl From<&PaymentMethodTypeEnum> for Option<StripePaymentMethodType> {
    fn from(val: &PaymentMethodTypeEnum) -> Self {
        match val {
            PaymentMethodTypeEnum::Card => Some(StripePaymentMethodType::Card),
            PaymentMethodTypeEnum::DirectDebitSepa => Some(StripePaymentMethodType::Sepa),
            PaymentMethodTypeEnum::DirectDebitAch => Some(StripePaymentMethodType::Ach),
            PaymentMethodTypeEnum::DirectDebitBacs => Some(StripePaymentMethodType::Bacs),
            PaymentMethodTypeEnum::Other => None,
            PaymentMethodTypeEnum::Transfer => None,
        }
    }
}

/// Mock payment provider for testing payment flows without external dependencies.
///
/// This provider simulates payment provider behavior and can be configured to:
/// - Return successful or failed payment intents
/// - Return successful or failed setup intents
///
/// TODO add webhook
pub struct MockPaymentProvider {
    config: MockPublicData,
}

impl MockPaymentProvider {
    pub fn new(config: MockPublicData) -> Self {
        Self { config }
    }
}

#[async_trait::async_trait]
impl PaymentProvider for MockPaymentProvider {
    async fn create_customer_in_provider(
        &self,
        customer: &Customer,
        _connector: &Connector,
    ) -> Result<String, Report<PaymentProviderError>> {
        // Return a mock external customer ID based on our customer ID
        Ok(format!("mock_cus_{}", customer.id.as_base62()))
    }

    async fn get_payment_method_from_provider(
        &self,
        _connector: &Connector,
        payment_method_id: &str,
        _customer_id: &str,
    ) -> Result<CustomerPaymentMethodFromProvider, Report<PaymentProviderError>> {
        // Return a mock card payment method
        Ok(CustomerPaymentMethodFromProvider {
            external_payment_method_id: payment_method_id.to_string(),
            payment_method_type: PaymentMethodTypeEnum::Card,
            account_number_hint: None,
            card_brand: Some("mock_visa".to_string()),
            card_last4: Some("4242".to_string()),
            card_exp_month: Some(12),
            card_exp_year: Some(2030),
        })
    }

    async fn create_setup_intent_in_provider(
        &self,
        connection: &CustomerConnection,
        connector: &Connector,
        _payment_methods: Vec<PaymentMethodTypeEnum>,
    ) -> Result<SetupIntent, Report<PaymentProviderError>> {
        if self.config.fail_setup_intent {
            return Err(Report::new(PaymentProviderError::SetupIntent(
                "Mock setup intent failure (configured)".to_string(),
            )));
        }

        let intent_id = format!("mock_seti_{}", Uuid::now_v7());

        Ok(SetupIntent {
            intent_id,
            client_secret: format!("mock_secret_{}", Uuid::now_v7()),
            public_key: SecretString::from("mock_pk_test_key".to_string()),
            provider: ConnectorProviderEnum::Mock,
            connector_id: connector.id,
            connection_id: connection.id,
        })
    }

    async fn create_payment_intent_in_provider(
        &self,
        connector: &Connector,
        transaction_id: &PaymentTransactionId,
        _customer_external_id: &str,
        _payment_method_external_id: &str,
        _payment_method_type: &PaymentMethodTypeEnum,
        amount: i64,
        currency: &str,
    ) -> Result<PaymentIntent, Report<PaymentProviderError>> {
        let external_id = format!("mock_pi_{}", Uuid::now_v7());

        let (status, processed_at) = if self.config.fail_payment_intent {
            (PaymentStatusEnum::Failed.into(), None)
        } else {
            (
                PaymentStatusEnum::Settled.into(),
                Some(chrono::Utc::now().naive_utc()),
            )
        };

        Ok(PaymentIntent {
            external_id,
            amount_requested: amount,
            amount_received: if self.config.fail_payment_intent {
                None
            } else {
                Some(amount)
            },
            currency: currency.to_string(),
            next_action: None,
            status,
            processed_at,
            last_payment_error: if self.config.fail_payment_intent {
                Some("Mock payment failure (configured)".to_string())
            } else {
                None
            },
            tenant_id: connector.tenant_id,
            transaction_id: *transaction_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stripe_client::webhook::{EventObject, StripeWebhook};

    /// Guards the exact `payment_intent.succeeded` JSON shape the webhook worker
    /// parses: it must deserialize to a `PaymentIntent` event object and map to a
    /// domain `PaymentIntent` carrying the meteroid metadata and a settled status.
    #[test]
    fn payment_intent_succeeded_event_parses_to_domain() {
        let tenant_id = TenantId::new();
        let transaction_id = PaymentTransactionId::new();

        let body = format!(
            r#"{{
                "id": "evt_x",
                "type": "payment_intent.succeeded",
                "data": {{ "object": {{
                    "object": "payment_intent",
                    "id": "pi_x",
                    "amount": 10000,
                    "amount_received": 10000,
                    "currency": "usd",
                    "livemode": false,
                    "status": "succeeded",
                    "metadata": {{
                        "meteroid.tenant_id": "{}",
                        "meteroid.transaction_id": "{}"
                    }}
                }}}}
            }}"#,
            tenant_id.as_base62(),
            transaction_id.as_base62()
        );

        let event = StripeWebhook::parse_event(&body).expect("parse event");
        assert_eq!(event.event_type, "payment_intent.succeeded");

        let intent = match event.data.object {
            EventObject::PaymentIntent(intent) => intent,
            _ => panic!("expected a PaymentIntent event object"),
        };
        assert_eq!(intent.status, StripePaymentStatus::Succeeded);

        let domain: PaymentIntent = intent.try_into().expect("map to domain PaymentIntent");
        assert_eq!(domain.tenant_id, tenant_id);
        assert_eq!(domain.transaction_id, transaction_id);
        // Only the Succeeded -> Settled mapping stamps processed_at.
        assert!(domain.processed_at.is_some());
    }
}
