//! Extra item fields per category, e.g. frame number for bikes.
//! Category names are free text, so the fields are matched by keywords.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use uuid::Uuid;

const MAX_VALUE_LENGTH: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CategoryField {
    pub key: &'static str,
    /// Translation of label, placeholder and hint: categoryFields.<text> in src/locales
    pub text: &'static str,
    pub label: &'static str,
}

const fn field(key: &'static str, text: &'static str, label: &'static str) -> CategoryField {
    CategoryField { key, text, label }
}

const BIKE: &[CategoryField] = &[
    field("frameNumber", "frameNumber", "Rahmennummer"),
    field("frameSize", "frameSize", "Rahmengröße"),
    field("wheelSize", "wheelSize", "Laufradgröße"),
    field("brand", "bikeBrand", "Marke"),
];
const CLOTHING: &[CategoryField] = &[
    field("size", "clothingSize", "Größe"),
    field("brand", "brand", "Marke"),
];
const SHOES: &[CategoryField] = &[
    field("size", "shoeSize", "Größe (EU)"),
    field("brand", "brand", "Marke"),
];
const SPORT: &[CategoryField] = &[
    field("size", "sportSize", "Größe / Länge"),
    field("brand", "brand", "Marke"),
];
const ELECTRONICS: &[CategoryField] = &[
    field("brand", "brand", "Marke"),
    field("model", "model", "Modell"),
];

struct Rule {
    matches: Regex,
    exclude: Option<Regex>,
    fields: &'static [CategoryField],
}

/// The first matching rule wins. `\b` is ASCII-only, as in JavaScript.
static RULES: LazyLock<Vec<Rule>> = LazyLock::new(|| {
    let re = |pattern: &str| {
        Regex::new(&format!("(?i){}", pattern.replace(r"\b", r"(?-u:\b)"))).unwrap()
    };
    vec![
        Rule {
            // "rad" only as a whole word or word ending, so "Radio" does not count as a bike
            matches: re(r"fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx"),
            // Accessories and clothing for cyclists have no frame number
            exclude: Some(re(r"zubehör|teile|bekleidung|helm|anhänger|schloss")),
            fields: BIKE,
        },
        Rule {
            matches: re(r"schuh|stiefel|sneaker"),
            exclude: None,
            fields: SHOES,
        },
        // "mode" only as a word or word ending ("Damenmode"), not in "Sondermodelle"
        Rule {
            matches: re(r"kleid|jacke|hose|\bmode\b|mode$|shirt|pullover"),
            exclude: None,
            fields: CLOTHING,
        },
        Rule {
            matches: re(r"sport|\bski|snowboard"),
            exclude: None,
            fields: SPORT,
        },
        Rule {
            matches: re(r"elektron|handy|smartphone|computer|laptop|tablet|kamera|konsole"),
            exclude: None,
            fields: ELECTRONICS,
        },
    ]
});

/// Fields an organizer can make required, one per key.
pub fn requirable_fields() -> Vec<CategoryField> {
    let mut seen = HashSet::new();
    RULES
        .iter()
        .flat_map(|rule| rule.fields.iter().copied())
        .filter(|field| seen.insert(field.key))
        .collect()
}

pub fn fields_for_label(label: &str) -> Option<&'static [CategoryField]> {
    let name = label.trim();
    RULES
        .iter()
        .find(|rule| {
            rule.matches.is_match(name)
                && !rule.exclude.as_ref().is_some_and(|ex| ex.is_match(name))
        })
        .map(|rule| rule.fields)
}

/// A category with its parent, for the inheritance of fields.
pub struct CategoryRef {
    pub id: Uuid,
    pub label: String,
    pub parent: Option<Uuid>,
}

/// Fields of a category; sub-categories without their own set inherit the parent's.
pub fn category_fields(category: Uuid, categories: &[CategoryRef]) -> &'static [CategoryField] {
    let by_id: HashMap<Uuid, &CategoryRef> = categories.iter().map(|c| (c.id, c)).collect();
    let mut seen = HashSet::new();
    let mut current = by_id.get(&category).copied();
    while let Some(cat) = current {
        if !seen.insert(cat.id) {
            break;
        }
        if let Some(fields) = fields_for_label(&cat.label) {
            return fields;
        }
        current = cat.parent.and_then(|parent| by_id.get(&parent).copied());
    }
    &[]
}

pub async fn load_categories(conn: &mut sqlx::PgConnection) -> sqlx::Result<Vec<CategoryRef>> {
    let rows: Vec<(Uuid, String, Option<Uuid>)> =
        sqlx::query_as("SELECT id, label, parent_id FROM categories")
            .fetch_all(conn)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(id, label, parent)| CategoryRef { id, label, parent })
        .collect())
}

/// Keeps only the fields of the category, trims values and drops empty ones; None when
/// nothing is left.
pub fn sanitize_attributes(
    fields: &[CategoryField],
    attributes: Option<&BTreeMap<String, String>>,
) -> Option<BTreeMap<String, String>> {
    let attributes = attributes?;
    let result: BTreeMap<String, String> = fields
        .iter()
        .filter_map(|field| {
            let value = attributes.get(field.key)?.trim();
            (!value.is_empty()).then(|| {
                (
                    field.key.to_owned(),
                    value.chars().take(MAX_VALUE_LENGTH).collect(),
                )
            })
        })
        .collect();
    (!result.is_empty()).then_some(result)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Attribute {
    pub label: &'static str,
    pub text: &'static str,
    pub value: String,
}

/// Label/value pairs for display, in the order the category defines.
pub fn describe_attributes(
    fields: &[CategoryField],
    attributes: Option<&serde_json::Value>,
) -> Vec<Attribute> {
    let Some(attributes) = attributes.and_then(|a| a.as_object()) else {
        return Vec::new();
    };
    fields
        .iter()
        .filter_map(|field| {
            let value = attributes
                .get(field.key)?
                .as_str()
                .filter(|v| !v.is_empty())?;
            Some(Attribute {
                label: field.label,
                text: field.text,
                value: value.to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(label: &str) -> Vec<&'static str> {
        fields_for_label(label)
            .unwrap_or(&[])
            .iter()
            .map(|f| f.key)
            .collect()
    }

    #[test]
    fn categories_are_matched_by_keywords() {
        assert_eq!(
            keys("Fahrräder"),
            ["frameNumber", "frameSize", "wheelSize", "brand"]
        );
        assert_eq!(keys("Kinderrad"), keys("Fahrräder"));
        assert_eq!(keys("E-Bikes / Pedelecs"), keys("Fahrräder"));
        assert!(keys("Radio").is_empty());
        assert!(keys("Fahrradzubehör").is_empty());
        assert_eq!(keys("Damenmode"), ["size", "brand"]);
        assert!(keys("Sondermodelle").is_empty());
        assert_eq!(keys("Skischuhe"), ["size", "brand"]);
        assert_eq!(keys("Laptops"), ["brand", "model"]);
    }

    #[test]
    fn sub_categories_inherit_the_fields() {
        let bikes = Uuid::new_v4();
        let kids = Uuid::new_v4();
        let categories = vec![
            CategoryRef {
                id: bikes,
                label: "Fahrräder".into(),
                parent: None,
            },
            CategoryRef {
                id: kids,
                label: "Für Kinder".into(),
                parent: Some(bikes),
            },
        ];
        assert_eq!(category_fields(kids, &categories).len(), 4);
    }

    #[test]
    fn requirable_fields_are_unique_by_key() {
        let keys: Vec<_> = requirable_fields().iter().map(|f| f.key).collect();
        assert_eq!(
            keys,
            [
                "frameNumber",
                "frameSize",
                "wheelSize",
                "brand",
                "size",
                "model"
            ]
        );
    }
}
