//! Texts the backend writes itself. They live next to the app texts in
//! src/locales/<language>/, so Weblate and the locale test cover them too (like
//! convex/i18n.ts and convex/errors.ts).

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "locale", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    #[default]
    De,
    En,
}

impl Locale {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "de" => Some(Self::De),
            "en" => Some(Self::En),
            _ => None,
        }
    }
}

fn parse(json: &str) -> Value {
    serde_json::from_str(json).expect("locale file is valid JSON")
}

static ERRORS_DE: LazyLock<Value> =
    LazyLock::new(|| parse(include_str!("../../src/locales/de/errors.json")));
static MAIL_DE: LazyLock<Value> =
    LazyLock::new(|| parse(include_str!("../../src/locales/de/mail.json")));
static MAIL_EN: LazyLock<Value> =
    LazyLock::new(|| parse(include_str!("../../src/locales/en/mail.json")));

fn lookup<'a>(root: &'a Value, key: &str) -> Option<&'a str> {
    key.split('.')
        .try_fold(root, |node, part| node.get(part))?
        .as_str()
}

/// Replaces `{{name}}` placeholders like i18next (without escaping).
pub fn interpolate(text: &str, values: &[(&str, &str)]) -> String {
    let mut result = text.to_owned();
    for (name, value) in values {
        result = result.replace(&format!("{{{{{name}}}}}"), value);
    }
    result
}

/// German text of an error code in errors.json; the code itself if there is none.
pub fn error_text(code: &str, values: &[(&str, &str)]) -> String {
    lookup(&ERRORS_DE, code).map_or_else(|| code.to_owned(), |text| interpolate(text, values))
}

/// Mail text in the given language, falling back to German like i18next.
pub fn mail_text(locale: Locale, key: &str, values: &[(&str, &str)]) -> String {
    let root = match locale {
        Locale::De => &*MAIL_DE,
        Locale::En => &*MAIL_EN,
    };
    let text = lookup(root, key)
        .or_else(|| lookup(&MAIL_DE, key))
        .unwrap_or(key);
    interpolate(text, values)
}

/// Mail text with a count, choosing `<key>_one` or `<key>_other` like i18next (German
/// and English have the same plural rule).
pub fn mail_text_count(locale: Locale, key: &str, count: i64, values: &[(&str, &str)]) -> String {
    let suffix = if count == 1 { "one" } else { "other" };
    let count = count.to_string();
    let mut all: Vec<(&str, &str)> = values.to_vec();
    all.push(("count", &count));
    mail_text(locale, &format!("{key}_{suffix}"), &all)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mail_texts_are_translated_and_interpolated() {
        assert_eq!(
            mail_text(Locale::De, "verify.subject", &[("brand", "BazarPro")]),
            "Bestätige deine E-Mail-Adresse für BazarPro"
        );
        assert_ne!(
            mail_text(Locale::En, "verify.heading", &[]),
            mail_text(Locale::De, "verify.heading", &[])
        );
    }

    #[test]
    fn plurals() {
        assert_eq!(
            mail_text_count(Locale::De, "common.items", 1, &[]),
            "1 Artikel"
        );
        assert_eq!(
            mail_text_count(Locale::De, "common.items", 3, &[]),
            "3 Artikel"
        );
    }

    #[test]
    fn error_codes_resolve_to_german_texts() {
        assert_eq!(error_text("auth.required", &[]), "Bitte melde dich an.");
        assert_eq!(error_text("ACCOUNT_BANNED", &[]), "ACCOUNT_BANNED");
    }
}
