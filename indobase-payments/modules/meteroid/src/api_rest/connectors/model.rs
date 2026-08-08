use common_domain::ids::{ConnectorId, string_serde};
use utoipa::ToSchema;
use validator::Validate;

#[derive(Clone, ToSchema, serde::Serialize, serde::Deserialize)]
pub struct Connector {
    #[serde(with = "string_serde")]
    pub id: ConnectorId,
    pub alias: String,
    pub provider: String,
    pub connector_type: String,
}

#[derive(ToSchema, serde::Serialize, serde::Deserialize)]
pub struct ConnectorListResponse {
    pub data: Vec<Connector>,
}

#[derive(ToSchema, serde::Serialize, serde::Deserialize, Validate)]
pub struct ConnectStripeRequest {
    #[validate(length(min = 1, max = 64))]
    pub alias: String,
    /// Optional for server-only connectors; Checkout CTAs usually need pk_.
    #[serde(default)]
    pub api_publishable_key: String,
    #[validate(length(min = 1))]
    pub api_secret_key: String,
    #[serde(default)]
    pub webhook_secret: String,
}

#[derive(ToSchema, serde::Serialize, serde::Deserialize, Validate)]
pub struct ConnectRazorpayRequest {
    #[validate(length(min = 1, max = 64))]
    pub alias: String,
    #[validate(length(min = 1))]
    pub key_id: String,
    #[validate(length(min = 1))]
    pub key_secret: String,
    #[serde(default)]
    pub webhook_secret: String,
}

#[derive(ToSchema, serde::Serialize, serde::Deserialize)]
pub struct ConnectConnectorResponse {
    pub connector: Connector,
}
