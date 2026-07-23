use crate::api_rest::AppState;
use crate::api_rest::empty_string_as_none;
use crate::config::Config;
use crate::errors::RestApiError;
use axum::extract::{Path, Query, State};
use axum::response::Redirect;
use error_stack::Report;
use jsonwebtoken::{DecodingKey, Validation};
use meteroid_oauth::model::OauthProvider;
use meteroid_store::domain::oauth::{OauthVerifierData, SignInData};
use meteroid_store::domain::users::StudioHandoffSigninRequest;
use meteroid_store::errors::StoreError;
use meteroid_store::repositories::TenantInterface;
use meteroid_store::repositories::connectors::ConnectorsInterface;
use meteroid_store::repositories::oauth::OauthInterface;
use meteroid_store::repositories::users::UserInterface;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct GetCallbackUrlParams {
    is_signup: bool,
    #[serde(default, deserialize_with = "empty_string_as_none")]
    invite_key: Option<String>,
}

#[derive(Deserialize)]
pub struct CallbackParams {
    code: String,
    state: String,
}

#[derive(Debug, Deserialize)]
pub struct StudioHandoffParams {
    token: String,
}

#[derive(Debug, Deserialize)]
struct StudioHandoffClaims {
    aud: String,
    email: String,
    exp: i64,
    organization_slug: String,
    #[serde(default)]
    organization_name: Option<String>,
    /// Caller's Studio org role. Payments moves money, so only owner/admin are accepted.
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

fn verify_studio_handoff_token(
    token: &str,
    secret: &SecretString,
) -> Result<StudioHandoffClaims, String> {
    let mut validation = Validation::default();
    validation.set_audience(&["indobase-payments"]);
    validation.validate_exp = true;

    let data = jsonwebtoken::decode::<StudioHandoffClaims>(
        token,
        &DecodingKey::from_secret(secret.expose_secret().as_bytes()),
        &validation,
    )
    .map_err(|e| format!("invalid handoff token: {e}"))?;

    if data.claims.aud != "indobase-payments" {
        return Err("invalid handoff audience".into());
    }
    if data.claims.email.trim().is_empty() || data.claims.organization_slug.trim().is_empty() {
        return Err("handoff token missing email or organization".into());
    }
    // Only owners/admins may access Payments. Studio already rejects members before minting a
    // token; this re-check means a token that lacks (or forges a non-privileged) role is refused
    // here too — the engine never trusts Studio's gate alone.
    match data.claims.role.as_deref() {
        Some("owner") | Some("admin") => {}
        _ => return Err("Payments access requires an organization owner or admin".into()),
    }

    Ok(data.claims)
}

#[axum::debug_handler]
pub async fn studio_handoff(
    Query(params): Query<StudioHandoffParams>,
    State(app_state): State<AppState>,
) -> Redirect {
    exchange_studio_handoff(&params.token, app_state).await
}

async fn exchange_studio_handoff(token: &str, app_state: AppState) -> Redirect {
    let Some(secret) = resolve_studio_handoff_secret() else {
        log::warn!("STUDIO_HANDOFF_SECRET / PAYMENTS_HANDOFF_SECRET not configured");
        return Redirect::to(signin_error_url_msg("studio handoff is not configured").as_str());
    };

    let claims = match verify_studio_handoff_token(token, &secret) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Studio handoff verify failed: {e}");
            return Redirect::to(signin_error_url_msg(&e).as_str());
        }
    };

    let auth_res = app_state
        .store
        .studio_handoff_signin(StudioHandoffSigninRequest {
            email: claims.email,
            organization_slug: claims.organization_slug,
            organization_name: claims.organization_name,
        })
        .await;

    match auth_res {
        Ok(resp) => Redirect::to(signin_success_url(&resp.token).as_str()),
        Err(e) => {
            log::warn!("Studio handoff signin failed: {e:?}");
            Redirect::to(signin_error_url(e).as_str())
        }
    }
}

fn signin_error_url_msg(error: &str) -> String {
    format!(
        "{}/login?error={}",
        Config::get().public_url.as_str(),
        urlencoding_encode(error)
    )
}

fn urlencoding_encode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

#[axum::debug_handler]
pub async fn redirect_to_identity_provider(
    Path(provider): Path<OauthProvider>,
    Query(params): Query<GetCallbackUrlParams>,
    State(app_state): State<AppState>,
) -> Redirect {
    let callback_url_res = app_state
        .store
        .oauth_auth_url(
            provider,
            OauthVerifierData::SignIn(SignInData {
                is_signup: params.is_signup,
                invite_key: params.invite_key,
            }),
        )
        .await;

    match callback_url_res {
        Ok(url) => Redirect::to(url.expose_secret()),
        Err(e) => {
            log::warn!("Error getting callback URL: {e:?}");
            Redirect::to(signin_error_url(e).as_str())
        }
    }
}

#[axum::debug_handler]
pub async fn callback(
    Path(provider): Path<OauthProvider>,
    Query(params): Query<CallbackParams>,
    State(app_state): State<AppState>,
) -> Result<Redirect, RestApiError> {
    match provider {
        OauthProvider::Google => Ok(signin_callback(provider, params, app_state).await),
        OauthProvider::Hubspot => {
            oauth_connect_callback(OauthProvider::Hubspot, params, app_state).await
        }
        OauthProvider::Pennylane => {
            oauth_connect_callback(OauthProvider::Pennylane, params, app_state).await
        }
    }
}

async fn oauth_connect_callback(
    oauth_provider: OauthProvider,
    params: CallbackParams,
    app_state: AppState,
) -> Result<Redirect, RestApiError> {
    let connected = app_state
        .store
        .connect_oauth(oauth_provider, params.code.into(), params.state.into())
        .await;

    match connected {
        Ok(conn) => {
            let tenant = app_state
                .store
                .find_tenant_by_id(conn.connector.tenant_id)
                .await
                .map_err(RestApiError::from)?;

            use common_domain::actor::Actor;
            use common_domain::ids::{BaseId, UserId};
            use meteroid_store::domain::entity_activity::{
                Activity, ActivityType, AuditInput, EntityType,
            };
            use meteroid_store::repositories::entity_activity::EntityActivityInterface;
            let provider_str = match oauth_provider {
                OauthProvider::Hubspot => "hubspot",
                OauthProvider::Pennylane => "pennylane",
                OauthProvider::Google => "google",
            };
            let actor = match conn.initiated_by {
                Some(id) => Actor::User {
                    id: UserId::from(id),
                },
                None => Actor::System,
            };
            let activity = Activity::new(
                ActivityType::ConnectorConnected,
                EntityType::Connector,
                conn.connector.id.as_uuid(),
            )
            .with_metadata(serde_json::json!({
                "provider": provider_str,
                "alias": conn.connector.alias,
            }));
            let _ = app_state
                .store
                .record(
                    conn.connector.tenant_id,
                    actor,
                    AuditInput::Activity(activity),
                )
                .await;

            let section = match oauth_provider {
                OauthProvider::Hubspot => "#crm",
                OauthProvider::Pennylane => "#accounting",
                _ => "",
            };

            let url = format!(
                "{}/{}/{}/settings?success=true&tab=integrations{}",
                Config::get().public_url,
                tenant.organization.slug,
                tenant.tenant.slug,
                section
            );

            Ok(Redirect::to(url.as_str()))
        }
        Err(e) => {
            log::warn!("Error connecting {oauth_provider}: {e:?}");
            Err(RestApiError::from(e))
        }
    }
}

async fn signin_callback(
    provider: OauthProvider,
    params: CallbackParams,
    app_state: AppState,
) -> Redirect {
    let auth_res = app_state
        .store
        .oauth_signin(provider, params.code.into(), params.state.into())
        .await;

    match auth_res {
        Ok(url) => Redirect::to(signin_success_url(&url.token).as_str()),
        Err(e) => {
            log::warn!("Error executing callback: {e:?}");
            Redirect::to(signin_error_url(e).as_str())
        }
    }
}

fn signin_error_url(error: Report<StoreError>) -> String {
    let error = match error.current_context() {
        StoreError::OauthError(error) => error.as_ref(),
        StoreError::UserRegistrationClosed(error) => error.as_ref(),
        StoreError::InvalidArgument(error) => error.as_ref(),
        _ => "internal server error",
    };

    signin_error_url_msg(error)
}

fn signin_success_url(token: &SecretString) -> String {
    format!(
        "{}/oauth_success?token={}",
        Config::get().public_url.as_str(),
        token.expose_secret()
    )
}
