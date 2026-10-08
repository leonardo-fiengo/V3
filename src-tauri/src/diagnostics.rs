//! Log stable codes only: no requests, passwords, paths or financial values.
pub fn record(path: &std::path::Path, code: &str) {
    use std::io::Write;
    let log = path.with_file_name("diagnostics.log");
    if std::fs::metadata(&log).is_ok_and(|m| m.len() > 1024 * 1024) {
        let _ = std::fs::rename(&log, log.with_extension("previous.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log)
    {
        let safe: String = code
            .chars()
            .filter(|c| c.is_ascii_uppercase() || *c == '_')
            .take(60)
            .collect();
        let _ = writeln!(f, "{} {}", chrono::Utc::now().to_rfc3339(), safe);
    }
}
