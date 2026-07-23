use crate::api_rest::AppState;
use axum::Router;
use axum::routing::get;

mod router;

pub fn oauth_routes() -> Router<AppState> {
    Router::new()
        // Register concrete path before `/oauth/{provider}` so it is not captured as a provider.
        .route("/oauth/studio-handoff", get(router::studio_handoff))
        .route(
            "/oauth/{provider}",
            get(router::redirect_to_identity_provider),
        )
        .route("/oauth-callback/{provider}", get(router::callback))
}
