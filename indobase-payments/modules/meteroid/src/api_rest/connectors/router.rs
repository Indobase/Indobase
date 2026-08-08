use crate::api_rest::AppState;
use crate::api_rest::connectors::model::{
    ConnectConnectorResponse, ConnectRazorpayRequest, ConnectStripeRequest, Connector,
    ConnectorListResponse,
};
use crate::api_rest::error::RestErrorResponse;
use crate::errors::RestApiError;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use axum_valid::Valid;
use common_grpc::middleware::server::auth::AuthorizedAsTenant;
use http::StatusCode;
use meteroid_store::domain::connectors::{RazorpaySensitiveData, StripeSensitiveData};
use meteroid_store::domain::enums::{ConnectorProviderEnum, ConnectorTypeEnum};
use meteroid_store::repositories::connectors::ConnectorsInterface;

fn provider_key(provider: &ConnectorProviderEnum) -> &'static str {
    match provider {
        ConnectorProviderEnum::Stripe => "stripe",
        ConnectorProviderEnum::Hubspot => "hubspot",
        ConnectorProviderEnum::Pennylane => "pennylane",
        ConnectorProviderEnum::Mock => "mock",
        ConnectorProviderEnum::Razorpay => "razorpay",
    }
}

fn connector_type_key(connector_type: &ConnectorTypeEnum) -> &'static str {
    match connector_type {
        ConnectorTypeEnum::PaymentProvider => "payment_provider",
        ConnectorTypeEnum::Crm => "crm",
        ConnectorTypeEnum::Accounting => "accounting",
    }
}

fn meta_to_rest(meta: &meteroid_store::domain::connectors::ConnectorMeta) -> Connector {
    Connector {
        id: meta.id,
        alias: meta.alias.clone(),
        provider: provider_key(&meta.provider).to_string(),
        connector_type: connector_type_key(&meta.connector_type).to_string(),
    }
}

async fn replace_existing_alias(
    app_state: &AppState,
    authorized_state: &AuthorizedAsTenant,
    alias: &str,
    provider: ConnectorProviderEnum,
) -> Result<(), RestApiError> {
    let existing = app_state
        .store
        .list_connectors(Some(ConnectorTypeEnum::PaymentProvider), authorized_state.tenant_id)
        .await
        .map_err(RestApiError::from)?;

    for connector in existing {
        if connector.alias == alias || connector.provider == provider {
            app_state
                .store
                .delete_connector(
                    authorized_state.as_actor(),
                    connector.id,
                    authorized_state.tenant_id,
                )
                .await
                .map_err(RestApiError::from)?;
        }
    }
    Ok(())
}

/// List payment connectors for the tenant (metadata only — never secrets).
#[utoipa::path(
    get,
    tag = "Connectors",
    path = "/api/v1/connectors",
    responses(
        (status = 200, description = "List of connectors", body = ConnectorListResponse),
        (status = 401, description = "Unauthorized", body = RestErrorResponse),
        (status = 500, description = "Internal error", body = RestErrorResponse),
    ),
    security(("bearer_auth" = []))
)]
#[axum::debug_handler]
pub(crate) async fn list_connectors(
    Extension(authorized_state): Extension<AuthorizedAsTenant>,
    State(app_state): State<AppState>,
) -> Result<impl IntoResponse, RestApiError> {
    let connectors = app_state
        .store
        .list_connectors(Some(ConnectorTypeEnum::PaymentProvider), authorized_state.tenant_id)
        .await
        .map_err(|e| {
            log::error!("Error listing connectors: {e}");
            RestApiError::from(e)
        })?;

    Ok(Json(ConnectorListResponse {
        data: connectors
            .into_iter()
            .map(|c| Connector {
                id: c.id,
                alias: c.alias,
                provider: provider_key(&c.provider).to_string(),
                connector_type: connector_type_key(&c.connector_type).to_string(),
            })
            .collect(),
    }))
}

/// Connect Stripe (international cards) with merchant API keys (BYOK).
#[utoipa::path(
    post,
    tag = "Connectors",
    path = "/api/v1/connectors/stripe",
    request_body(content = ConnectStripeRequest, content_type = "application/json"),
    responses(
        (status = 201, description = "Stripe connector connected", body = ConnectConnectorResponse),
        (status = 400, description = "Bad request", body = RestErrorResponse),
        (status = 401, description = "Unauthorized", body = RestErrorResponse),
        (status = 500, description = "Internal error", body = RestErrorResponse),
    ),
    security(("bearer_auth" = []))
)]
#[axum::debug_handler]
pub(crate) async fn connect_stripe(
    Extension(authorized_state): Extension<AuthorizedAsTenant>,
    State(app_state): State<AppState>,
    Valid(Json(payload)): Valid<Json<ConnectStripeRequest>>,
) -> Result<impl IntoResponse, RestApiError> {
    let alias = payload.alias.trim().to_string();
    let publishable = payload.api_publishable_key.trim().to_string();
    let secret = payload.api_secret_key.trim().to_string();
    if !secret.starts_with("sk_") {
        return Err(RestApiError::InvalidInput(
            "api_secret_key must start with sk_".to_string(),
        ));
    }
    if !publishable.is_empty() && !publishable.starts_with("pk_") {
        return Err(RestApiError::InvalidInput(
            "api_publishable_key must start with pk_".to_string(),
        ));
    }

    let sensitive = StripeSensitiveData {
        api_secret_key: secret,
        webhook_secret: payload.webhook_secret.trim().to_string(),
    };

    let account_id = app_state
        .services
        .get_stripe_account_id(&sensitive)
        .await
        .map_err(|e| {
            log::error!("Stripe account probe failed: {e}");
            RestApiError::from(e)
        })?;

    replace_existing_alias(
        &app_state,
        &authorized_state,
        &alias,
        ConnectorProviderEnum::Stripe,
    )
    .await?;

    let meta = app_state
        .store
        .connect_stripe(
            authorized_state.as_actor(),
            authorized_state.tenant_id,
            alias,
            publishable,
            sensitive,
            account_id,
        )
        .await
        .map_err(|e| {
            log::error!("Error connecting Stripe: {e}");
            RestApiError::from(e)
        })?;

    Ok((
        StatusCode::CREATED,
        Json(ConnectConnectorResponse {
            connector: meta_to_rest(&meta),
        }),
    ))
}

/// Connect India settlements (Razorpay) with merchant API keys (BYOK).
#[utoipa::path(
    post,
    tag = "Connectors",
    path = "/api/v1/connectors/razorpay",
    request_body(content = ConnectRazorpayRequest, content_type = "application/json"),
    responses(
        (status = 201, description = "India settlements connector connected", body = ConnectConnectorResponse),
        (status = 400, description = "Bad request", body = RestErrorResponse),
        (status = 401, description = "Unauthorized", body = RestErrorResponse),
        (status = 500, description = "Internal error", body = RestErrorResponse),
    ),
    security(("bearer_auth" = []))
)]
#[axum::debug_handler]
pub(crate) async fn connect_razorpay(
    Extension(authorized_state): Extension<AuthorizedAsTenant>,
    State(app_state): State<AppState>,
    Valid(Json(payload)): Valid<Json<ConnectRazorpayRequest>>,
) -> Result<impl IntoResponse, RestApiError> {
    let alias = payload.alias.trim().to_string();
    let key_id = payload.key_id.trim().to_string();
    let key_secret = payload.key_secret.trim().to_string();
    if !key_id.starts_with("rzp_") {
        return Err(RestApiError::InvalidInput(
            "key_id must start with rzp_".to_string(),
        ));
    }
    if key_secret.len() < 16 {
        return Err(RestApiError::InvalidInput(
            "key_secret looks invalid".to_string(),
        ));
    }

    let sensitive = RazorpaySensitiveData {
        key_secret,
        webhook_secret: payload.webhook_secret.trim().to_string(),
    };

    replace_existing_alias(
        &app_state,
        &authorized_state,
        &alias,
        ConnectorProviderEnum::Razorpay,
    )
    .await?;

    let meta = app_state
        .store
        .connect_razorpay(
            authorized_state.as_actor(),
            authorized_state.tenant_id,
            alias,
            key_id,
            sensitive,
        )
        .await
        .map_err(|e| {
            log::error!("Error connecting India settlements: {e}");
            RestApiError::from(e)
        })?;

    Ok((
        StatusCode::CREATED,
        Json(ConnectConnectorResponse {
            connector: meta_to_rest(&meta),
        }),
    ))
}
