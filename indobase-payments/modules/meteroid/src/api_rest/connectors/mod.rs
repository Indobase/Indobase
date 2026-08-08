use crate::api_rest::AppState;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

pub mod model;
mod router;

pub fn connector_routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(router::list_connectors))
        .routes(routes!(router::connect_stripe))
        .routes(routes!(router::connect_razorpay))
}
