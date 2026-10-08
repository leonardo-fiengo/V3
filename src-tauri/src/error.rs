use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Serialize, TS, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub field: Option<String>,
}
pub type Result<T> = std::result::Result<T, AppError>;
impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            field: None,
        }
    }
    pub fn field(field: &str, message: &str) -> Self {
        Self {
            code: "VALIDATION".into(),
            message: message.into(),
            field: Some(field.into()),
        }
    }
}
impl From<rusqlite::Error> for AppError {
    fn from(_: rusqlite::Error) -> Self {
        Self::new(
            "DATABASE",
            "The vault could not complete this operation. No changes were saved.",
        )
    }
}
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        let message = match e.kind() { std::io::ErrorKind::PermissionDenied => "Permission denied. Choose a writable location. No changes were saved.", std::io::ErrorKind::NotFound => "This file or destination is unavailable.", _ => "Could not save the file. Check disk space and destination permissions. No changes were saved." };
        Self::new("FILE_IO", message)
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for AppError {}
