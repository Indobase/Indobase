use envconfig::Envconfig;
use secrecy::SecretString;

#[derive(Envconfig, Debug, Clone)]
pub struct MailerConfig {
    #[envconfig(from = "MAILER_SMTP_HOST")]
    pub smtp_host: Option<String>,
    #[envconfig(from = "MAILER_SMTP_USERNAME")]
    pub smtp_username: Option<SecretString>,
    #[envconfig(from = "MAILER_SMTP_PASSWORD")]
    pub smtp_password: Option<SecretString>,
    #[envconfig(from = "MAILER_SMTP_TLS", default = "true")]
    pub smtp_tls: bool,
    #[envconfig(from = "MAILER_FROM", default = "Indobase Payments <payments@indobase.in>")]
    pub from: String,
}

impl MailerConfig {
    pub fn dummy() -> Self {
        MailerConfig {
            smtp_host: None,
            smtp_username: None,
            smtp_password: None,
            smtp_tls: true,
            from: "Indobase Payments <payments@indobase.in>".to_string(),
        }
    }
}
