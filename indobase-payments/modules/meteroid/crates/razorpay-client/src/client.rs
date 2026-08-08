use crate::error::RazorpayError;
use crate::models::{
    CreateCustomerRequest, CreateLinkedAccountRequest, CreateOrderRequest,
    CreateRecurringPaymentRequest, CreateStakeholderRequest, Customer, LinkedAccount, Order,
    Payment, Stakeholder, Token, TokenList,
};
use base64::Engine;
use reqwest::{Client, Method, StatusCode};
use secrecy::{ExposeSecret, SecretString};
use serde::de::DeserializeOwned;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RazorpayClient {
    client: Client,
    /// Payments / Orders / Customers — https://api.razorpay.com/v1
    api_base: String,
    /// Route Linked Accounts — https://api.razorpay.com/v2
    api_base_v2: String,
}

impl Default for RazorpayClient {
    fn default() -> Self {
        Self::new()
    }
}

impl RazorpayClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .build()
                .expect("invalid reqwest client"),
            api_base: "https://api.razorpay.com/v1".to_string(),
            api_base_v2: "https://api.razorpay.com/v2".to_string(),
        }
    }

    pub fn with_base_url(api_base: impl Into<String>) -> Self {
        let mut c = Self::new();
        c.api_base = api_base.into();
        c
    }

    pub fn with_base_urls(api_base: impl Into<String>, api_base_v2: impl Into<String>) -> Self {
        let mut c = Self::new();
        c.api_base = api_base.into();
        c.api_base_v2 = api_base_v2.into();
        c
    }

    fn auth_header(key_id: &str, key_secret: &SecretString) -> String {
        let token = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", key_id, key_secret.expose_secret()));
        format!("Basic {token}")
    }

    async fn send_at<R: DeserializeOwned>(
        &self,
        base: &str,
        method: Method,
        path: &str,
        key_id: &str,
        key_secret: &SecretString,
        body: Option<serde_json::Value>,
    ) -> Result<R, RazorpayError> {
        let url = format!("{}{}", base, path);
        let mut req = self
            .client
            .request(method, &url)
            .header("Authorization", Self::auth_header(key_id, key_secret))
            .header(
                "User-Agent",
                concat!("IndobasePayments/Razorpay/", env!("CARGO_PKG_VERSION")),
            );

        if let Some(b) = body {
            req = req.header("Content-Type", "application/json").json(&b);
        }

        let res = req
            .send()
            .await
            .map_err(|e| RazorpayError::Http(e.to_string()))?;

        let status = res.status();
        let text = res
            .text()
            .await
            .map_err(|e| RazorpayError::Http(e.to_string()))?;

        if !status.is_success() {
            let message = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.get("error")
                        .and_then(|e| e.get("description"))
                        .and_then(|d| d.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or(text);
            return Err(RazorpayError::Api {
                status: status.as_u16(),
                message,
            });
        }

        serde_json::from_str(&text).map_err(|e| RazorpayError::Json(e.to_string()))
    }

    async fn send<R: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        key_id: &str,
        key_secret: &SecretString,
        body: Option<serde_json::Value>,
    ) -> Result<R, RazorpayError> {
        self.send_at(&self.api_base, method, path, key_id, key_secret, body)
            .await
    }

    pub async fn create_customer(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        req: CreateCustomerRequest,
    ) -> Result<Customer, RazorpayError> {
        let body = serde_json::to_value(req).map_err(|e| RazorpayError::Json(e.to_string()))?;
        self.send(Method::POST, "/customers", key_id, key_secret, Some(body))
            .await
    }

    /// https://razorpay.com/docs/api/customers/fetch-with-id/
    pub async fn get_customer(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        customer_id: &str,
    ) -> Result<Customer, RazorpayError> {
        self.send(
            Method::GET,
            &format!("/customers/{customer_id}"),
            key_id,
            key_secret,
            None,
        )
        .await
    }

    pub async fn create_order(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        req: CreateOrderRequest,
    ) -> Result<Order, RazorpayError> {
        let body = serde_json::to_value(req).map_err(|e| RazorpayError::Json(e.to_string()))?;
        self.send(Method::POST, "/orders", key_id, key_secret, Some(body))
            .await
    }

    pub async fn create_recurring_payment(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        req: CreateRecurringPaymentRequest,
    ) -> Result<Payment, RazorpayError> {
        let body = serde_json::to_value(req).map_err(|e| RazorpayError::Json(e.to_string()))?;
        self.send(
            Method::POST,
            "/payments/create/recurring",
            key_id,
            key_secret,
            Some(body),
        )
        .await
    }

    pub async fn get_payment(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        payment_id: &str,
    ) -> Result<Payment, RazorpayError> {
        self.send(
            Method::GET,
            &format!("/payments/{payment_id}"),
            key_id,
            key_secret,
            None,
        )
        .await
    }

    pub async fn get_token(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        customer_id: &str,
        token_id: &str,
    ) -> Result<Token, RazorpayError> {
        self.send(
            Method::GET,
            &format!("/customers/{customer_id}/tokens/{token_id}"),
            key_id,
            key_secret,
            None,
        )
        .await
    }

    pub async fn list_tokens(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        customer_id: &str,
    ) -> Result<TokenList, RazorpayError> {
        self.send(
            Method::GET,
            &format!("/customers/{customer_id}/tokens"),
            key_id,
            key_secret,
            None,
        )
        .await
    }

    pub async fn ping(
        &self,
        key_id: &str,
        key_secret: &SecretString,
    ) -> Result<(), RazorpayError> {
        let url = format!("{}/customers?count=1", self.api_base);
        let res = self
            .client
            .get(&url)
            .header("Authorization", Self::auth_header(key_id, key_secret))
            .send()
            .await
            .map_err(|e| RazorpayError::Http(e.to_string()))?;
        if res.status() == StatusCode::UNAUTHORIZED || res.status() == StatusCode::FORBIDDEN {
            return Err(RazorpayError::Api {
                status: res.status().as_u16(),
                message: "Invalid India settlements API credentials".to_string(),
            });
        }
        if !res.status().is_success() {
            let status = res.status().as_u16();
            let message = res.text().await.unwrap_or_default();
            return Err(RazorpayError::Api { status, message });
        }
        Ok(())
    }

    /// Route Linked Account — https://razorpay.com/docs/api/payments/route/create-linked-account/
    pub async fn create_linked_account(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        req: CreateLinkedAccountRequest,
    ) -> Result<LinkedAccount, RazorpayError> {
        let body = serde_json::to_value(req).map_err(|e| RazorpayError::Json(e.to_string()))?;
        self.send_at(
            &self.api_base_v2,
            Method::POST,
            "/accounts",
            key_id,
            key_secret,
            Some(body),
        )
        .await
    }

    /// Fetch Linked Account — https://razorpay.com/docs/api/payments/route/
    pub async fn get_linked_account(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        account_id: &str,
    ) -> Result<LinkedAccount, RazorpayError> {
        self.send_at(
            &self.api_base_v2,
            Method::GET,
            &format!("/accounts/{account_id}"),
            key_id,
            key_secret,
            None,
        )
        .await
    }

    /// Create Stakeholder — https://razorpay.com/docs/api/payments/route/create-stakeholder/
    pub async fn create_stakeholder(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        account_id: &str,
        req: CreateStakeholderRequest,
    ) -> Result<Stakeholder, RazorpayError> {
        let body = serde_json::to_value(req).map_err(|e| RazorpayError::Json(e.to_string()))?;
        self.send_at(
            &self.api_base_v2,
            Method::POST,
            &format!("/accounts/{account_id}/stakeholders"),
            key_id,
            key_secret,
            Some(body),
        )
        .await
    }

    /// Request product config — https://razorpay.com/docs/api/payments/route/request-product-config/
    pub async fn request_product_configuration(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        account_id: &str,
        product_name: &str,
    ) -> Result<serde_json::Value, RazorpayError> {
        let body = serde_json::json!({ "product_name": product_name });
        self.send_at(
            &self.api_base_v2,
            Method::POST,
            &format!("/accounts/{account_id}/products"),
            key_id,
            key_secret,
            Some(body),
        )
        .await
    }

    /// Update product / settlements — https://razorpay.com/docs/api/payments/route/update-product-config/
    pub async fn update_product_configuration(
        &self,
        key_id: &str,
        key_secret: &SecretString,
        account_id: &str,
        product_id: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, RazorpayError> {
        self.send_at(
            &self.api_base_v2,
            Method::PATCH,
            &format!("/accounts/{account_id}/products/{product_id}"),
            key_id,
            key_secret,
            Some(body),
        )
        .await
    }
}
