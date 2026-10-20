//! Dates and times on Berlin time, in German or English (convex/berlinTime.ts).

use chrono::{DateTime, Datelike, Duration, NaiveTime, TimeZone, Timelike, Utc};
use chrono_tz::Europe::Berlin;

use crate::i18n::Locale;

const WEEKDAYS_DE: [&str; 7] = [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
];
const WEEKDAYS_EN: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const MONTHS_DE: [&str; 12] = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
];
const MONTHS_EN: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// "Samstag, 18. Oktober 2026" or "Saturday, 18 October 2026"
pub fn format_date(time: DateTime<Utc>, locale: Locale) -> String {
    let local = time.with_timezone(&Berlin);
    let weekday = local.weekday().num_days_from_monday() as usize;
    let month = local.month0() as usize;
    match locale {
        Locale::En => format!(
            "{}, {} {} {}",
            WEEKDAYS_EN[weekday],
            local.day(),
            MONTHS_EN[month],
            local.year()
        ),
        Locale::De => format!(
            "{}, {}. {} {}",
            WEEKDAYS_DE[weekday],
            local.day(),
            MONTHS_DE[month],
            local.year()
        ),
    }
}

/// "9:00"
pub fn format_time(time: DateTime<Utc>) -> String {
    let local = time.with_timezone(&Berlin);
    format!("{}:{:02}", local.hour(), local.minute())
}

/// "Samstag, 18. Oktober 2026, 9:00–11:00 Uhr", or both dates when they differ.
pub fn format_range(start: DateTime<Utc>, end: Option<DateTime<Utc>>, locale: Locale) -> String {
    let oclock = if locale == Locale::En { "" } else { " Uhr" };
    let date = |time| format_date(time, locale);
    let Some(end) = end else {
        return format!("{}, {}{oclock}", date(start), format_time(start));
    };
    if date(start) == date(end) {
        return format!(
            "{}, {}–{}{oclock}",
            date(start),
            format_time(start),
            format_time(end)
        );
    }
    let until = if locale == Locale::En { "until" } else { "bis" };
    format!(
        "{}, {}{oclock} {until} {}, {}{oclock}",
        date(start),
        format_time(start),
        date(end),
        format_time(end)
    )
}

/// Midnight in Berlin at the start of the day of `time`.
pub fn start_of_day(time: DateTime<Utc>) -> DateTime<Utc> {
    let day = time.with_timezone(&Berlin).date_naive();
    Berlin
        .from_local_datetime(&day.and_time(NaiveTime::MIN))
        .earliest()
        .expect("midnight exists in Berlin")
        .with_timezone(&Utc)
}

/// 18:00 in Berlin on the day before `time`: when the info mail for sellers goes out.
pub fn evening_before(time: DateTime<Utc>) -> DateTime<Utc> {
    start_of_day(time) - Duration::hours(6)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(text: &str) -> DateTime<Utc> {
        text.parse().unwrap()
    }

    #[test]
    fn dates_in_summer_and_winter_time() {
        // 07:00 UTC is 9:00 in summer, 8:00 in winter
        assert_eq!(
            format_date(utc("2026-10-24T07:00:00Z"), Locale::De),
            "Samstag, 24. Oktober 2026"
        );
        assert_eq!(
            format_date(utc("2026-10-24T07:00:00Z"), Locale::En),
            "Saturday, 24 October 2026"
        );
        assert_eq!(format_time(utc("2026-10-24T07:00:00Z")), "9:00");
        assert_eq!(format_time(utc("2026-12-05T07:05:00Z")), "8:05");
        // 23:30 UTC is already the next day in Berlin
        assert_eq!(
            format_date(utc("2026-12-05T23:30:00Z"), Locale::De),
            "Sonntag, 6. Dezember 2026"
        );
    }

    #[test]
    fn ranges() {
        let start = utc("2026-10-24T07:00:00Z");
        assert_eq!(
            format_range(start, Some(utc("2026-10-24T09:00:00Z")), Locale::De),
            "Samstag, 24. Oktober 2026, 9:00–11:00 Uhr"
        );
        assert_eq!(
            format_range(start, Some(utc("2026-10-25T09:00:00Z")), Locale::En),
            "Saturday, 24 October 2026, 9:00 until Sunday, 25 October 2026, 10:00"
        );
        assert_eq!(
            format_range(start, None, Locale::De),
            "Samstag, 24. Oktober 2026, 9:00 Uhr"
        );
    }

    #[test]
    fn the_evening_before_on_the_day_the_clocks_change() {
        // Sunday 25 October 2026: the clocks go back at 03:00
        let bazaar = utc("2026-10-25T09:00:00Z");
        assert_eq!(start_of_day(bazaar), utc("2026-10-24T22:00:00Z"));
        assert_eq!(evening_before(bazaar), utc("2026-10-24T16:00:00Z"));
    }
}
