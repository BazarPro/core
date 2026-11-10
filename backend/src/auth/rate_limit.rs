//! Attempts per identifier, against guessing passwords and codes and against flooding:
//! sign-ins per email and client, event access codes per user (`accessCode:<user id>`),
//! code mails per address, uploads per user. A bucket of `per_hour` attempts, refilled by
//! as many per hour.
//!
//! An attempt is taken before the secret is checked, in one statement that counts and
//! compares: of any number of parallel requests only as many get through as attempts are
//! left. Whoever got it right gives the attempt back.
//!
//! Runs on the pool, not in the transaction of the request: the attempt must stay
//! recorded although the request itself fails and rolls back.

use std::convert::Infallible;
use std::net::IpAddr;

use axum::extract::FromRequestParts;
use axum::http::HeaderMap;
use axum::http::request::Parts;
use sqlx::{PgConnection, PgPool};

/// Wrong passwords, codes and access codes per hour
pub const GUESSES_PER_HOUR: f64 = 10.0;
/// Wrong passwords for one address from all clients together. Far above what one client
/// gets, so nobody locks a user out with a few requests, and still too few to guess a
/// password from many addresses.
const PASSWORD_GUESSES_PER_ADDRESS: f64 = 100.0;

/// Takes one attempt; false if none is left.
pub async fn try_consume(db: &PgPool, identifier: &str, per_hour: f64) -> sqlx::Result<bool> {
    // A full bucket is not stored. An existing one is only updated while an attempt is
    // left: the row lock makes parallel requests see each other's attempt
    let taken: Option<bool> = sqlx::query_scalar(
        "INSERT INTO auth_rate_limits AS l (identifier, attempts_left, last_attempt_at)
         VALUES ($1, $2 - 1, now())
         ON CONFLICT (identifier) DO UPDATE SET
           attempts_left = least($2, l.attempts_left
             + extract(epoch FROM now() - l.last_attempt_at) * $3) - 1,
           last_attempt_at = now()
         WHERE least($2, l.attempts_left
             + extract(epoch FROM now() - l.last_attempt_at) * $3) >= 1
         RETURNING true",
    )
    .bind(identifier)
    .bind(per_hour)
    .bind(per_hour / 3600.0)
    .fetch_optional(db)
    .await?;
    Ok(taken.is_some())
}

/// Gives back an attempt taken with `try_consume`.
pub async fn refund(db: &PgPool, identifier: &str, per_hour: f64) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE auth_rate_limits SET attempts_left = least($2, attempts_left + 1)
         WHERE identifier = $1",
    )
    .bind(identifier)
    .bind(per_hour)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn reset(db: &PgPool, identifier: &str) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM auth_rate_limits WHERE identifier = $1")
        .bind(identifier)
        .execute(db)
        .await?;
    Ok(())
}

/// Forgets the attempts for an address, when its account is anonymized.
pub async fn forget(conn: &mut PgConnection, email: &str) -> sqlx::Result<()> {
    sqlx::query(
        "DELETE FROM auth_rate_limits
         WHERE identifier = ANY($1) OR starts_with(identifier, $2) OR starts_with(identifier, $3)",
    )
    .bind([format!("password:{email}"), format!("codeMail:{email}")])
    .bind(format!("password:{email}|"))
    .bind(format!("code:{email}|"))
    .execute(conn)
    .await?;
    Ok(())
}

/// Where a request comes from, to count the guesses of one client apart from those of
/// everybody else. The address the reverse proxy saw: the last entry of
/// `X-Forwarded-For`, which the proxy writes itself, whatever the client sent. Without a
/// proxy in front all requests count as one client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Client(String);

impl Client {
    pub fn from_headers(headers: &HeaderMap) -> Self {
        let address = headers
            .get_all("x-forwarded-for")
            .iter()
            .next_back()
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .and_then(|entry| entry.trim().parse::<IpAddr>().ok());
        Self(match address.map(|ip| ip.to_canonical()) {
            Some(IpAddr::V4(ip)) => ip.to_string(),
            // A customer usually has a whole /64: all of it is one client
            Some(IpAddr::V6(ip)) => {
                let [a, b, c, d, ..] = ip.segments();
                format!("{a:x}:{b:x}:{c:x}:{d:x}::/64")
            }
            None => "-".to_owned(),
        })
    }
}

impl<S: Sync> FromRequestParts<S> for Client {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Infallible> {
        Ok(Self::from_headers(&parts.headers))
    }
}

/// One guess at a secret of an address (password or mailed code), taken before the check.
/// Counted per address and client, so the wrong guesses of one client do not lock out
/// the owner of the address; passwords have a second, far higher limit per address.
#[must_use = "an attempt that was right or not checked has to be given back"]
pub struct Attempt {
    client: String,
    address: Option<String>,
}

impl Attempt {
    /// None: no attempt left.
    pub async fn password(db: &PgPool, email: &str, client: &Client) -> sqlx::Result<Option<Self>> {
        let attempt = Self {
            client: format!("password:{email}|{}", client.0),
            address: Some(format!("password:{email}")),
        };
        attempt.take(db).await
    }

    /// A code from the inbox does not depend on the wrong passwords for the address: who
    /// reads the mails gets in. The guesses of all clients together are counted on the
    /// code itself.
    pub async fn code(db: &PgPool, email: &str, client: &Client) -> sqlx::Result<Option<Self>> {
        let attempt = Self {
            client: format!("code:{email}|{}", client.0),
            address: None,
        };
        attempt.take(db).await
    }

    async fn take(self, db: &PgPool) -> sqlx::Result<Option<Self>> {
        if !try_consume(db, &self.client, GUESSES_PER_HOUR).await? {
            return Ok(None);
        }
        if let Some(address) = &self.address
            && !try_consume(db, address, PASSWORD_GUESSES_PER_ADDRESS).await?
        {
            return Ok(None);
        }
        Ok(Some(self))
    }

    /// The secret was right: this client starts anew.
    pub async fn succeeded(self, db: &PgPool) -> sqlx::Result<()> {
        reset(db, &self.client).await?;
        if let Some(address) = &self.address {
            refund(db, address, PASSWORD_GUESSES_PER_ADDRESS).await?;
        }
        Ok(())
    }

    /// The request failed for another reason than a wrong secret.
    pub async fn not_counted(self, db: &PgPool) -> sqlx::Result<()> {
        refund(db, &self.client, GUESSES_PER_HOUR).await?;
        if let Some(address) = &self.address {
            refund(db, address, PASSWORD_GUESSES_PER_ADDRESS).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(forwarded: &[&'static str]) -> Client {
        let mut headers = HeaderMap::new();
        for value in forwarded {
            headers.append("x-forwarded-for", value.parse().unwrap());
        }
        Client::from_headers(&headers)
    }

    #[test]
    fn the_client_is_the_address_the_proxy_added() {
        assert_eq!(client(&["203.0.113.7"]).0, "203.0.113.7");
        // What the client claims comes first and does not count
        assert_eq!(client(&["10.0.0.1, 203.0.113.7"]).0, "203.0.113.7");
        assert_eq!(
            client(&["10.0.0.1", "10.0.0.2,203.0.113.8"]).0,
            "203.0.113.8"
        );
        assert_eq!(client(&["::ffff:203.0.113.7"]).0, "203.0.113.7");
    }

    #[test]
    fn an_ipv6_network_is_one_client() {
        assert_eq!(
            client(&["2001:db8:1:2:aaaa:bbbb:cccc:dddd"]),
            client(&["2001:db8:1:2::1"])
        );
        assert_ne!(client(&["2001:db8:1:3::1"]), client(&["2001:db8:1:2::1"]));
    }

    #[test]
    fn without_a_proxy_all_requests_are_one_client() {
        assert_eq!(client(&[]).0, "-");
        assert_eq!(client(&["unknown"]).0, "-");
    }
}
