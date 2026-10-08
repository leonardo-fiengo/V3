use crate::error::{AppError, Result};
use rusqlite::{serialize::OwnedData, Connection, DatabaseName};
use std::ptr::NonNull;

pub fn fresh() -> Result<Connection> {
    let c = Connection::open_in_memory()?;
    c.execute_batch(include_str!("../migrations/001_initial.sql"))?;
    Ok(c)
}
pub fn image(c: &Connection) -> Result<Vec<u8>> {
    Ok(c.serialize(DatabaseName::Main)?.to_vec())
}
pub fn from_image(bytes: &[u8]) -> Result<Connection> {
    if bytes.len() < 100
        || bytes.len() > 128 * 1024 * 1024
        || !bytes.starts_with(b"SQLite format 3\0")
    {
        return Err(AppError::new(
            "INVALID_VAULT",
            "This file does not contain a valid vault database.",
        ));
    }
    let mut c = Connection::open_in_memory()?;
    // SQLite takes ownership of its own allocator's buffer. Never pass a Vec allocation.
    let ptr =
        NonNull::new(unsafe { rusqlite::ffi::sqlite3_malloc64(bytes.len() as u64) } as *mut u8)
            .ok_or_else(|| AppError::new("MEMORY", "Not enough memory to open this vault."))?;
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr.as_ptr(), bytes.len());
    }
    let data = unsafe { OwnedData::from_raw_nonnull(ptr, bytes.len()) };
    c.deserialize(DatabaseName::Main, data, false)?;
    c.execute_batch("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;")?;
    validate(&c)?;
    Ok(c)
}
pub fn validate(c: &Connection) -> Result<()> {
    let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if v != 1 {
        return Err(AppError::new(
            "SCHEMA_VERSION",
            "This vault needs a different application version. Your saved file has been preserved.",
        ));
    }
    let integrity: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    let foreign = c.prepare("PRAGMA foreign_key_check")?.exists([])?;
    let bad: i64 = c.query_row("SELECT COUNT(*) FROM journal_entries e WHERE posted<>1 OR (SELECT COUNT(*) FROM postings p WHERE p.entry_id=e.id)<2 OR (SELECT COALESCE(SUM(amount),0) FROM postings p WHERE p.entry_id=e.id)<>0", [], |r| r.get(0))?;
    if integrity != "ok" || foreign || bad != 0 {
        return Err(AppError::new(
            "INTEGRITY",
            "The vault failed its integrity checks. Your saved file has been preserved.",
        ));
    }
    Ok(())
}
