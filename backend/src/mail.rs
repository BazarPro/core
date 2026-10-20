//! Sending emails (convex/mail.ts). Mails go out from jobs, so a slow or failing SMTP
//! server delays them and retries instead of failing the user's request.

use std::sync::{Arc, Mutex};

use anyhow::Context;
use chrono::{Datelike, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use lettre::message::header::ContentType;
use lettre::message::{Mailbox, Message};
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::transport::smtp::extension::ClientId;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;

use crate::config::{Config, InstanceMode};
use crate::i18n::{Locale, mail_text};
use crate::{AppState, flags};

/// A rendered email.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mail {
    pub to: String,
    pub subject: String,
    pub html: String,
    /// Display name instead of the one in AUTH_EMAIL_FROM, e.g. the association's name
    pub sender_name: Option<String>,
}

#[derive(Clone)]
pub enum Mailer {
    Smtp {
        transport: Box<AsyncSmtpTransport<Tokio1Executor>>,
        from: Mailbox,
    },
    /// Tests: keeps the mails instead of sending them
    Memory(Arc<Mutex<Vec<Mail>>>),
    /// No AUTH_SMTP_HOST: mails are logged and dropped
    Disabled,
}

impl Mailer {
    pub fn from_config(config: &Config) -> anyhow::Result<Self> {
        let Some(smtp) = &config.smtp else {
            return Ok(Self::Disabled);
        };
        let from: Mailbox = config
            .email_from
            .parse()
            .context("AUTH_EMAIL_FROM is not an address")?;
        let tls_parameters = TlsParameters::new(smtp.host.clone())?;
        let tls = if smtp.secure {
            Tls::Wrapper(tls_parameters)
        } else if smtp.starttls {
            Tls::Opportunistic(tls_parameters)
        } else {
            Tls::None
        };
        let ehlo = smtp.ehlo_host.clone().unwrap_or_else(|| {
            // The domain of the sender address, as the Convex implementation did
            let domain = from.email.domain();
            if domain.contains('.') {
                domain.to_owned()
            } else {
                "localhost".to_owned()
            }
        });
        let mut builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&smtp.host)
            .port(smtp.port)
            .tls(tls)
            .hello_name(ClientId::Domain(ehlo))
            .timeout(Some(smtp.timeout));
        if let (Some(user), Some(pass)) = (&smtp.user, &smtp.pass) {
            builder = builder.credentials(Credentials::new(user.clone(), pass.clone()));
        }
        Ok(Self::Smtp {
            transport: Box::new(builder.build()),
            from,
        })
    }

    pub fn memory() -> (Self, Arc<Mutex<Vec<Mail>>>) {
        let sent = Arc::new(Mutex::new(Vec::new()));
        (Self::Memory(sent.clone()), sent)
    }

    pub async fn send(&self, mail: Mail) -> anyhow::Result<()> {
        match self {
            Self::Smtp { transport, from } => {
                let mut from = from.clone();
                if let Some(name) = &mail.sender_name {
                    from.name = Some(
                        name.replace(['<', '>', '"', '\\', '\r', '\n'], "")
                            .trim()
                            .to_owned(),
                    );
                }
                let message = Message::builder()
                    .from(from)
                    .to(mail.to.parse().context("invalid recipient")?)
                    .subject(mail.subject)
                    .header(ContentType::TEXT_HTML)
                    .body(mail.html)?;
                transport.send(message).await?;
            }
            Self::Memory(sent) => sent.lock().unwrap().push(mail),
            Self::Disabled => {
                tracing::warn!(
                    subject = mail.subject,
                    "no SMTP server configured, mail dropped"
                );
            }
        }
        Ok(())
    }
}

/// Name and logo in the mails: the association on self-hosted instances.
#[derive(Clone, Debug)]
pub struct Brand {
    pub name: String,
    pub logo_url: Option<String>,
    /// Self-hosted association: its name is also the sender name
    pub is_instance: bool,
}

pub async fn load_brand(conn: &mut PgConnection, config: &Config) -> sqlx::Result<Brand> {
    if config.mode != InstanceMode::Single {
        return Ok(Brand {
            name: "BazarPro".to_owned(),
            logo_url: None,
            is_instance: false,
        });
    }
    let settings: Option<(Option<String>, Option<uuid::Uuid>)> =
        sqlx::query_as("SELECT name, logo_id FROM site_settings")
            .fetch_optional(conn)
            .await?;
    let (name, logo) = settings.unwrap_or_default();
    Ok(Brand {
        name: name
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "Basar".to_owned()),
        logo_url: logo.map(|id| crate::storage::url(config, id)),
        is_instance: true,
    })
}

pub fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Shared frame of all emails: logo, white content box, footer.
pub fn layout(content: &str, brand: &Brand, locale: Locale) -> String {
    let t = |key: &str| escape_html(&mail_text(locale, key, &[]));
    let name = escape_html(&brand.name);
    let year = Utc::now().year();
    let footer = if brand.is_instance {
        format!("&copy; {year} {name} · {}", t("layout.poweredBy"))
    } else {
        format!("&copy; {year} BazarPro. {}", t("layout.rights"))
    };
    let logo = match &brand.logo_url {
        Some(url) => format!(
            r#"<img src="{}" alt="" height="40" style="height: 40px; width: auto; vertical-align: middle;">"#,
            escape_html(url)
        ),
        None => r#"<svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                <path d="M3 6h18"></path>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>"#
            .to_owned(),
    };
    let lang = mail_text(locale, "layout.lang", &[]);
    format!(
        r#"
      <!DOCTYPE html>
      <html lang="{lang}">
      <head>
        <meta charset="utf-8">
        <style>
          body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
          .container {{ max-width: 600px; margin: 0 auto; padding: 40px 20px; }}
          .header {{ text-align: center; margin-bottom: 30px; }}
          .logo-container {{ display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }}
          .logo-icon {{ color: #2563eb; }}
          .logo-text {{ font-size: 24px; font-weight: bold; color: #2563eb; }}
          .content {{ background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; text-align: center; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }}
          h1 {{ font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #111827; }}
          p {{ margin-bottom: 24px; color: #4b5563; }}
          .code-container {{ background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0; letter-spacing: 4px; font-size: 32px; font-weight: bold; color: #111827; }}
          .footer {{ text-align: center; margin-top: 30px; font-size: 14px; color: #9ca3af; }}
          .button {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }}
          .expiry {{ font-size: 13px; color: #9ca3af; margin-top: 24px; }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-container">
              {logo}
              <span class="logo-text">{name}</span>
            </div>
          </div>
          <div class="content">{content}          </div>
          <div class="footer">
            {footer}
          </div>
        </div>
      </body>
      </html>
"#
    )
}

pub const VERIFICATION_JOB: &str = "mail.verification";

/// Payload of the verification job: sign-up confirmation or password reset code.
#[derive(Debug, Serialize, Deserialize)]
pub struct VerificationMail {
    pub to: String,
    pub code: String,
    pub reset: bool,
    /// Path in the app the link opens, e.g. `/register`
    pub redirect_to: Option<String>,
}

/// Link in the mail: the app page with the code, so one click confirms.
fn verification_link(config: &Config, mail: &VerificationMail) -> String {
    let path = mail.redirect_to.as_deref().unwrap_or("/");
    let (path, query) = path.split_once('?').unwrap_or((path, ""));
    let mut params: Vec<(String, String)> = query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            Some((
                urlencoding::decode(key).ok()?.into_owned(),
                urlencoding::decode(value).ok()?.into_owned(),
            ))
        })
        .filter(|(key, _)| {
            !matches!(
                key.as_str(),
                "code" | "mode" | "resetCode" | "verifyCode" | "email"
            )
        })
        .collect();
    let (mode, code_param) = if mail.reset {
        ("reset", "resetCode")
    } else {
        ("verify", "verifyCode")
    };
    params.push(("mode".to_owned(), mode.to_owned()));
    params.push((code_param.to_owned(), mail.code.clone()));
    params.push(("email".to_owned(), mail.to.clone()));
    let query: Vec<String> = params
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                urlencoding::encode(key),
                urlencoding::encode(value)
            )
        })
        .collect();
    format!("{}{path}?{}", config.site_url, query.join("&"))
}

pub async fn render_verification(
    conn: &mut PgConnection,
    config: &Config,
    mail: &VerificationMail,
) -> anyhow::Result<Mail> {
    let brand = load_brand(conn, config).await?;
    // The account exists already: sign-up stores the language chosen in the app
    let locale: Option<Locale> =
        sqlx::query_scalar("SELECT locale FROM users WHERE email = $1 ORDER BY created_at LIMIT 1")
            .bind(&mail.to)
            .fetch_optional(&mut *conn)
            .await?
            .flatten();
    let locale = locale.unwrap_or_default();
    let flow = if mail.reset { "reset" } else { "verify" };
    let t = |key: &str| mail_text(locale, &format!("{flow}.{key}"), &[("brand", &brand.name)]);
    let button = format!(
        r#"<a href="{}" class="button">{}</a>"#,
        escape_html(&verification_link(config, mail)),
        escape_html(&t("button"))
    );
    let content = format!(
        r#"
            <h1>{}</h1>
            <p>{}</p>

            <div class="code-container">{}</div>

            {button}

            <p class="expiry">{}</p>
"#,
        escape_html(&t("heading")),
        escape_html(&t("text")),
        escape_html(&mail.code),
        escape_html(&mail_text(locale, "verify.expiry", &[])),
    );
    Ok(Mail {
        to: mail.to.clone(),
        subject: t("subject"),
        html: layout(&content, &brand, locale),
        sender_name: brand.is_instance.then(|| brand.name.clone()),
    })
}

pub fn send_verification(
    state: AppState,
    payload: serde_json::Value,
) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let mail: VerificationMail = serde_json::from_value(payload)?;
        let mut conn = state.db.acquire().await?;
        let rendered = render_verification(&mut conn, &state.config, &mail).await?;
        state.mailer.send(rendered).await
    }
    .boxed()
}

/// Sends the code, or with the E2E flag stores it for the tests to read.
pub async fn queue_verification(
    conn: &mut PgConnection,
    mail: VerificationMail,
) -> anyhow::Result<()> {
    if flags::get(conn, flags::E2E_AUTH_SKIP_EMAIL, false).await? {
        sqlx::query(
            "INSERT INTO e2e_auth_tokens (email, code) VALUES ($1, $2)
             ON CONFLICT (email) DO UPDATE SET code = EXCLUDED.code, created_at = now()",
        )
        .bind(&mail.to)
        .bind(&mail.code)
        .execute(conn)
        .await?;
        return Ok(());
    }
    crate::jobs::enqueue(conn, VERIFICATION_JOB, &mail, Utc::now()).await?;
    Ok(())
}
