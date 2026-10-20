//! Password hashes. New hashes are Argon2id; accounts imported from Convex keep the
//! Lucia scrypt hash (`<salt hex>:<key hex>`) until their next sign-in rehashes them.

use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use subtle::ConstantTimeEq;
use unicode_normalization::UnicodeNormalization;

/// Minimum length, as CustomPassword in Convex
pub const MIN_LENGTH: usize = 8;

pub fn is_valid(password: &str) -> bool {
    password.chars().count() >= MIN_LENGTH
}

pub async fn hash(password: String) -> anyhow::Result<String> {
    tokio::task::spawn_blocking(move || {
        let salt = rand::random::<[u8; 16]>();
        Argon2::default()
            .hash_password_with_salt(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|err| anyhow::anyhow!("hashing password: {err}"))
    })
    .await?
}

pub struct Verified {
    pub matches: bool,
    /// The hash is in the old Lucia format and should be replaced
    pub needs_rehash: bool,
}

pub async fn verify(password: String, stored: String) -> anyhow::Result<Verified> {
    tokio::task::spawn_blocking(move || {
        if stored.starts_with("$argon2") {
            let parsed =
                PasswordHash::new(&stored).map_err(|err| anyhow::anyhow!("stored hash: {err}"))?;
            let matches = Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok();
            return Ok(Verified {
                matches,
                needs_rehash: false,
            });
        }
        let matches = verify_lucia_scrypt(&password, &stored)?;
        Ok(Verified {
            matches,
            needs_rehash: matches,
        })
    })
    .await?
}

/// `new Scrypt().verify(hash, password)` of lucia 3: N=16384, r=16, p=1, 64 bytes; the
/// salt is the hex string itself, the password NFKC-normalized.
fn verify_lucia_scrypt(password: &str, stored: &str) -> anyhow::Result<bool> {
    let Some((salt, key_hex)) = stored.split_once(':') else {
        return Ok(false);
    };
    let Ok(expected) = hex::decode(key_hex) else {
        return Ok(false);
    };
    let params = scrypt::Params::new(14, 16, 1)?;
    let mut key = [0u8; 64];
    let normalized: String = password.nfkc().collect();
    scrypt::scrypt(normalized.as_bytes(), salt.as_bytes(), &params, &mut key)?;
    Ok(key[..].ct_eq(&expected[..]).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Made with `await new (require('lucia').Scrypt)().hash('geheim123')` (lucia 3.2.2)
    const LUCIA_HASH: &str = "8e37740c04727d44b9206c793d4cc130:75e852290a02857e3218cd8f9ec4bea387bf1e15eacedbe052179c0daa49eb930584b7568bba1be4beaaeca7b6c1b211a2d4e1fc850da7d9e27cfb42c4534a75";

    #[tokio::test]
    async fn verifies_hashes_from_convex() {
        let ok = verify("geheim123".into(), LUCIA_HASH.into()).await.unwrap();
        assert!(ok.matches && ok.needs_rehash);
        let wrong = verify("geheim124".into(), LUCIA_HASH.into()).await.unwrap();
        assert!(!wrong.matches);
    }

    #[tokio::test]
    async fn new_hashes_are_argon2() {
        let hashed = hash("geheim123".into()).await.unwrap();
        assert!(hashed.starts_with("$argon2id$"));
        let ok = verify("geheim123".into(), hashed.clone()).await.unwrap();
        assert!(ok.matches && !ok.needs_rehash);
        assert!(!verify("falsch".into(), hashed).await.unwrap().matches);
    }

    #[test]
    fn passwords_need_eight_characters() {
        assert!(!is_valid("1234567"));
        assert!(is_valid("12345678"));
    }
}
