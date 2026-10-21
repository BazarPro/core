//! Amounts in euros: rounded to cents half away from zero (0.125 → 0.13), like the
//! app's own formatting, not to even as `Decimal::round_dp` does (0.125 → 0.12).

use rust_decimal::{Decimal, RoundingStrategy};

pub trait Cents {
    fn cents(self) -> Decimal;
}

impl Cents for Decimal {
    fn cents(self) -> Decimal {
        self.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn halves_round_away_from_zero() {
        let cents = |value: &str| value.parse::<Decimal>().unwrap().cents().to_string();
        assert_eq!(cents("0.125"), "0.13");
        assert_eq!(cents("3.825"), "3.83");
        assert_eq!(cents("0.124"), "0.12");
        assert_eq!(cents("-0.125"), "-0.13");
    }
}
