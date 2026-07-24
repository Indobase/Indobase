use common_grpc::middleware::common::auth::BEARER_AUTH_HEADER;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use cached::proc_macro::cached;
use common_domain::auth::OrgMemberRole;
use common_grpc::middleware::server::auth::api_token_validator::ApiTokenValidator;
use http::{HeaderMap, Request};
use jsonwebtoken::{DecodingKey, Validation};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use tracing::{error, log};

use crate::api_rest::error::{ErrorCode, RestErrorResponse};
use crate::config::Config;
use common_domain::ids::{ApiTokenId, OrganizationId, TenantId};
use common_grpc::middleware::server::auth::{AuthorizedAsTenant, TenantActor, TenantEnv};
use meteroid_store::Store;
use meteroid_store::domain::enums::TenantEnvironmentEnum;
use meteroid_store::domain::users::StudioHandoffSigninRequest;
use meteroid_store::errors::StoreError;
use meteroid_store::repositories::OrganizationsInterface;
use meteroid_store::repositories::TenantInterface;
use meteroid_store::repositories::api_tokens::ApiTokensInterface;
use meteroid_store::repositories::users::UserInterface;

pub async fn auth_middleware(
    State(store): State<Store>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, Response> {
    if !req.uri().path().starts_with("/api/") {
        return Ok(next.run(req).await);
    }

    let bearer = match extract_bearer(req.headers()) {
        Ok(token) => token,
        Err(err) => {
            return Err(unauthorized_response(err));
        }
    };

    // API keys look like `pv_…/…`; Studio MCP JWTs are `header.payload.sig`.
    let authorized = if bearer.contains('/') {
        match validate_api_key_token(bearer, &store).await {
            Ok(state) => state,
            Err(err) => return Err(unauthorized_response(err)),
        }
    } else {
        match validate_studio_mcp_jwt(bearer, &store).await {
            Ok(state) => state,
            Err(err) => {
                // Fall back to API-key parsing for unusual key formats without `/`.
                match validate_api_key_token(bearer, &store).await {
                    Ok(state) => state,
                    Err(_) => return Err(unauthorized_response(err)),
                }
            }
        }
    };

    req.extensions_mut().insert(authorized);
    Ok(next.run(req).await)
}

fn unauthorized_response(err: AuthStatus) -> Response {
    let json = Json(RestErrorResponse {
        code: ErrorCode::Unauthorized,
        message: err.msg.unwrap_or_else(|| "Unauthorized".to_string()),
    });
    (err.status, json).into_response()
}

fn extract_bearer(header_map: &HeaderMap) -> Result<&str, AuthStatus> {
    header_map
        .get(BEARER_AUTH_HEADER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .filter(|s| !s.is_empty())
        .ok_or(AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("Invalid or missing Authorization header".to_string()),
        })
}

#[derive(Debug)]
struct AuthStatus {
    status: StatusCode,
    msg: Option<String>,
}

#[cached(
    result = true,
    size = 100,
    time = 120, // 2 min
    key = "ApiTokenId",
    convert = r#"{ *api_key_id }"#
)]
async fn validate_api_token_by_id_cached(
    store: &Store,
    validator: &ApiTokenValidator,
    api_key_id: &ApiTokenId,
) -> Result<(OrganizationId, TenantId, TenantEnv), AuthStatus> {
    let res = store
        .get_api_token_by_id_for_validation(api_key_id)
        .await
        .map_err(|err| {
            match err.current_context() {
                StoreError::ValueNotFound(_) => {}
                other => {
                    error!("Failed to resolve api key: {:?}", other);
                }
            }
            AuthStatus {
                status: StatusCode::UNAUTHORIZED,
                msg: Some("Failed to resolve api key".to_string()),
            }
        })?;

    validator
        .validate_hash(&res.hash)
        .map_err(|_e| AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("Unauthorized. Invalid hash".to_string()),
        })?;

    let tenant_env = if res.environment == TenantEnvironmentEnum::Production {
        TenantEnv::Production
    } else {
        TenantEnv::NonProduction
    };

    Ok((res.organization_id, res.tenant_id, tenant_env))
}

async fn validate_api_key_token(
    api_key: &str,
    store: &Store,
) -> Result<AuthorizedAsTenant, AuthStatus> {
    let (validator, id) = ApiTokenValidator::parse_api_key(api_key)
        .and_then(|v| {
            v.extract_identifier()
                .map(|id| (v, ApiTokenId::from_const(id)))
        })
        .map_err(|_| AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("Invalid API key format".to_string()),
        })?;

    let (organization_id, tenant_id, tenant_env) =
        validate_api_token_by_id_cached(store, &validator, &id).await?;

    Ok(AuthorizedAsTenant {
        tenant_id,
        organization_id,
        actor: TenantActor::ApiKey(id),
        tenant_env,
    })
}

#[derive(Debug, Deserialize)]
struct StudioMcpClaims {
    aud: String,
    email: String,
    organization_slug: String,
    #[serde(default)]
    organization_name: Option<String>,
    #[serde(default)]
    role: Option<String>,
}

fn resolve_studio_handoff_secret() -> Option<SecretString> {
    let from_config = Config::get()
        .studio_handoff_secret
        .as_ref()
        .map(|s| s.expose_secret().to_string())
        .filter(|s| s.len() >= 32);
    let from_env = std::env::var("PAYMENTS_HANDOFF_SECRET")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 32);
    from_config.or(from_env).map(SecretString::from)
}

/// Same slug mapping as Studio SSO (`ib-{sanitized}`) so MCP and UI share a tenant.
pub(crate) fn sanitize_studio_org_slug(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    let body = if trimmed.is_empty() {
        "org"
    } else {
        let max = trimmed.len().min(40);
        &trimmed[..max]
    };
    format!("ib-{body}")
}

async fn validate_studio_mcp_jwt(
    token: &str,
    store: &Store,
) -> Result<AuthorizedAsTenant, AuthStatus> {
    let Some(secret) = resolve_studio_handoff_secret() else {
        return Err(AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("Studio MCP auth is not configured".to_string()),
        });
    };

    let mut validation = Validation::default();
    validation.set_audience(&["indobase-payments-mcp"]);
    validation.validate_exp = true;

    let data = jsonwebtoken::decode::<StudioMcpClaims>(
        token,
        &DecodingKey::from_secret(secret.expose_secret().as_bytes()),
        &validation,
    )
    .map_err(|e| AuthStatus {
        status: StatusCode::UNAUTHORIZED,
        msg: Some(format!("invalid studio MCP token: {e}")),
    })?;

    if data.claims.aud != "indobase-payments-mcp" {
        return Err(AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("invalid studio MCP audience".to_string()),
        });
    }
    if data.claims.email.trim().is_empty() || data.claims.organization_slug.trim().is_empty() {
        return Err(AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("studio MCP token missing email or organization".to_string()),
        });
    }
    match data.claims.role.as_deref() {
        Some("owner") | Some("admin") | Some("developer") | Some("viewer") => {}
        _ => {
            return Err(AuthStatus {
                status: StatusCode::UNAUTHORIZED,
                msg: Some(
                    "Payments MCP requires an organization owner, admin, developer, or viewer"
                        .to_string(),
                ),
            });
        }
    }

    // Ensure operator user + Payments org exist (same path as browser SSO).
    let signin = store
        .studio_handoff_signin(StudioHandoffSigninRequest {
            email: data.claims.email.clone(),
            organization_slug: data.claims.organization_slug.clone(),
            organization_name: data.claims.organization_name.clone(),
        })
        .await
        .map_err(|e| {
            log::warn!("Studio MCP signin failed: {e:?}");
            AuthStatus {
                status: StatusCode::UNAUTHORIZED,
                msg: Some("Failed to resolve Payments operator for MCP".to_string()),
            }
        })?;

    let payments_slug = sanitize_studio_org_slug(&data.claims.organization_slug);
    let org = store
        .get_organizations_by_slug(payments_slug)
        .await
        .map_err(|e| {
            log::warn!("Studio MCP org lookup failed: {e:?}");
            AuthStatus {
                status: StatusCode::UNAUTHORIZED,
                msg: Some("Payments organization not found for Studio org".to_string()),
            }
        })?;

    let tenants = store
        .list_tenants_by_organization_id(org.id)
        .await
        .map_err(|e| {
            log::warn!("Studio MCP tenant list failed: {e:?}");
            AuthStatus {
                status: StatusCode::UNAUTHORIZED,
                msg: Some("Payments tenant not found".to_string()),
            }
        })?;

    let tenant = tenants
        .iter()
        .find(|t| t.environment == TenantEnvironmentEnum::Production)
        .or_else(|| tenants.first())
        .cloned()
        .ok_or(AuthStatus {
            status: StatusCode::UNAUTHORIZED,
            msg: Some("Payments tenant not provisioned yet".to_string()),
        })?;

    let tenant_env = if tenant.environment == TenantEnvironmentEnum::Production {
        TenantEnv::Production
    } else {
        TenantEnv::NonProduction
    };

    Ok(AuthorizedAsTenant {
        tenant_id: tenant.id,
        organization_id: org.id,
        actor: TenantActor::User {
            id: signin.user.id,
            role: OrgMemberRole::Admin,
        },
        tenant_env,
    })
}
