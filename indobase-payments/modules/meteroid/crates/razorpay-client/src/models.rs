use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct CreateCustomerRequest {
    pub name: Option<String>,
    pub email: Option<String>,
    pub contact: Option<String>,
    pub fail_existing: Option<String>,
    pub notes: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Customer {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub contact: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateOrderRequest {
    pub amount: i64,
    pub currency: String,
    pub receipt: Option<String>,
    pub customer_id: Option<String>,
    pub payment_capture: Option<u8>,
    pub notes: Option<HashMap<String, String>>,
    /// Auth / mandate registration (card / UPI Autopay). Omitted for subsequent charges.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Order {
    pub id: String,
    pub amount: i64,
    pub currency: String,
    pub status: Option<String>,
    pub notes: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateRecurringPaymentRequest {
    pub email: String,
    pub contact: String,
    pub amount: i64,
    pub currency: String,
    pub order_id: String,
    pub customer_id: String,
    pub token: String,
    pub recurring: String,
    pub notes: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Payment {
    pub id: String,
    pub amount: i64,
    pub currency: String,
    pub status: String,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub token_id: Option<String>,
    pub method: Option<String>,
    pub error_description: Option<String>,
    /// Razorpay may return `{}` or `[]` — keep flexible for webhooks.
    pub notes: Option<serde_json::Value>,
    pub card: Option<PaymentCard>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PaymentCard {
    pub last4: Option<String>,
    pub network: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Token {
    pub id: String,
    pub token: Option<String>,
    pub method: Option<String>,
    pub recurring: Option<bool>,
    pub recurring_details: Option<TokenRecurringDetails>,
    pub card: Option<PaymentCard>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenRecurringDetails {
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenList {
    pub items: Option<Vec<Token>>,
}

/// Payload returned as SetupIntent.client_secret for India Checkout.js.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndiaAuthCheckoutPayload {
    pub order_id: String,
    pub customer_id: String,
    pub key_id: String,
    pub amount: i64,
    pub currency: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub contact: Option<String>,
}

/// Razorpay Route Linked Account — `POST /v2/accounts`
/// https://razorpay.com/docs/api/payments/route/create-linked-account/
#[derive(Debug, Clone, Serialize)]
pub struct CreateLinkedAccountRequest {
    pub email: String,
    pub phone: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub legal_business_name: String,
    pub business_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_facing_business_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legal_info: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkedAccount {
    pub id: String,
    #[serde(rename = "type")]
    pub account_type: Option<String>,
    pub status: Option<String>,
    pub email: Option<String>,
    pub phone: Option<serde_json::Value>,
    pub legal_business_name: Option<String>,
    pub business_type: Option<String>,
    pub reference_id: Option<String>,
}

/// Route stakeholder — `POST /v2/accounts/:id/stakeholders`
/// https://razorpay.com/docs/api/payments/route/create-stakeholder/
#[derive(Debug, Clone, Serialize)]
pub struct CreateStakeholderRequest {
    pub name: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentage_ownership: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relationship: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kyc: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Stakeholder {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
}
