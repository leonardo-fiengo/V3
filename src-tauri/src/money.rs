use crate::error::{AppError, Result};
// Bound each value and aggregate well below SQLite's SUM overflow limit.
pub const LIMIT: i64 = 9_000_000_000_000;
pub fn parse(value: &str, field: &str, positive: bool) -> Result<i64> {
    let value = value.trim();
    let negative = value.starts_with('-');
    let digits = if negative { &value[1..] } else { value };
    let mut parts = digits.split('.');
    let whole = parts.next().unwrap_or("");
    let fraction = parts.next().unwrap_or("");
    if whole.is_empty()
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || fraction.len() > 2
        || !fraction.bytes().all(|c| c.is_ascii_digit())
        || parts.next().is_some()
    {
        return Err(AppError::field(
            field,
            "Enter an amount with at most two decimal places (for example 12.50).",
        ));
    }
    let w: i64 = whole
        .parse()
        .map_err(|_| AppError::field(field, "This amount is too large."))?;
    let f: i64 = match fraction.len() {
        0 => 0,
        1 => fraction.parse::<i64>().unwrap() * 10,
        _ => fraction.parse().unwrap(),
    };
    let n = w
        .checked_mul(100)
        .and_then(|n| n.checked_add(f))
        .filter(|n| *n <= LIMIT)
        .ok_or_else(|| AppError::field(field, "This amount is too large."))?;
    let n = if negative { -n } else { n };
    if positive && n <= 0 {
        return Err(AppError::field(field, "Enter an amount greater than zero."));
    }
    Ok(n)
}
pub fn decimal(n: i64) -> String {
    format!(
        "{}{}.{:02}",
        if n < 0 { "-" } else { "" },
        n.unsigned_abs() / 100,
        n.unsigned_abs() % 100
    )
}
pub fn add(a: i64, b: i64) -> Result<i64> {
    a.checked_add(b)
        .filter(|n| n.abs() <= LIMIT)
        .ok_or_else(|| {
            AppError::new(
                "MONEY_OVERFLOW",
                "This operation exceeds the supported balance limit.",
            )
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_money() {
        assert_eq!(parse("0.29", "amount", true).unwrap(), 29);
        assert_eq!(parse("-12.5", "amount", false).unwrap(), -1250);
        assert_eq!(decimal(-1), "-0.01");
        for bad in [
            "0",
            "-1",
            "1e2",
            "NaN",
            "1.234",
            "1,50",
            "999999999999999999999",
        ] {
            assert!(parse(bad, "amount", true).is_err(), "{bad}");
        }
    }
}
