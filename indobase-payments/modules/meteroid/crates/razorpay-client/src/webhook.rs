use crate::error::RazorpayError;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

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

pub fn verify_signature(raw_body: &[u8], signature: &str, secret: &str) -> bool {
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(raw_body);
    let expected = hex::encode(mac.finalize().into_bytes());
    constant_time_eq(expected.as_bytes(), signature.as_bytes())
}

#[derive(Debug, Clone, Deserialize)]
pub struct RazorpayEvent {
    pub event: String,
    pub payload: Value,
}

pub fn parse_event(body: &str) -> Result<RazorpayEvent, RazorpayError> {
    serde_json::from_str(body).map_err(|e| RazorpayError::Json(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_hmac() {
        let body = br#"{"event":"payment.captured"}"#;
        let secret = "whsec_test";
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let sig = hex::encode(mac.finalize().into_bytes());
        assert!(verify_signature(body, &sig, secret));
        assert!(!verify_signature(body, "bad", secret));
    }
}
