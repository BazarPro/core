//! The JSON shape the app knows from Convex: documents with `_id` and `_creationTime`,
//! times as milliseconds, absent fields left out instead of `null`.

use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

use crate::import::uuid_for;

/// An ID in the arguments of a function. Besides UUIDs it accepts the Convex IDs of
/// imported data, so printed QR codes and links in old emails keep working: they map to
/// the same UUID the import gave the row.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Id(pub Uuid);

impl Id {
    pub fn parse(value: &str) -> Option<Self> {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        Some(Self(
            Uuid::parse_str(value).unwrap_or_else(|_| uuid_for(value)),
        ))
    }
}

impl<'de> Deserialize<'de> for Id {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        Self::parse(&value).ok_or_else(|| serde::de::Error::custom("empty ID"))
    }
}

impl Serialize for Id {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl From<Id> for Uuid {
    fn from(id: Id) -> Self {
        id.0
    }
}

pub fn to_ms(time: &DateTime<Utc>) -> f64 {
    time.timestamp_millis() as f64
}

pub fn from_ms(ms: f64) -> Option<DateTime<Utc>> {
    Utc.timestamp_millis_opt(ms.round() as i64).single()
}

/// `#[serde(with = "ms")]`: a time as milliseconds since 1970, like `Date.now()`.
pub mod ms {
    use super::*;

    pub fn serialize<S: Serializer>(
        time: &DateTime<Utc>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_f64(to_ms(time))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<DateTime<Utc>, D::Error> {
        let ms = f64::deserialize(deserializer)?;
        from_ms(ms).ok_or_else(|| serde::de::Error::custom("time out of range"))
    }
}

/// `#[serde(with = "ms_opt", default)]` for optional times.
pub mod ms_opt {
    use super::*;

    pub fn serialize<S: Serializer>(
        time: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match time {
            Some(time) => serializer.serialize_f64(to_ms(time)),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<DateTime<Utc>>, D::Error> {
        match Option::<f64>::deserialize(deserializer)? {
            Some(ms) => from_ms(ms)
                .map(Some)
                .ok_or_else(|| serde::de::Error::custom("time out of range")),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_accept_uuids_and_convex_ids() {
        let uuid = Uuid::new_v4();
        assert_eq!(Id::parse(&uuid.to_string()), Some(Id(uuid)));
        assert_eq!(
            Id::parse("kg2034m5hj73z3v2b3mcqmpsz184mjpb"),
            Some(Id(uuid_for("kg2034m5hj73z3v2b3mcqmpsz184mjpb")))
        );
        assert_eq!(Id::parse(" "), None);
    }

    #[test]
    fn times_are_milliseconds() {
        let time = from_ms(1_792_832_400_000.0).unwrap();
        assert_eq!(time.to_rfc3339(), "2026-10-24T09:00:00+00:00");
        assert_eq!(to_ms(&time), 1_792_832_400_000.0);
    }
}
