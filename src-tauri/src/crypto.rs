use crate::error::{AppError, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};
const AAD: &[u8] = b"MoneyManager/v3/vault/1";
#[derive(Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub format: String,
    pub version: u32,
    pub saved_at: String,
    pub salt: String,
    pub wrapped_key: String,
    pub key_nonce: String,
    pub data_nonce: String,
    pub ciphertext: String,
}
pub fn random<const N: usize>() -> [u8; N] {
    let mut a = [0; N];
    OsRng.fill_bytes(&mut a);
    a
}
fn derive(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    let mut key = Zeroizing::new([0; 32]);
    let params = Params::new(65536, 3, 1, Some(32))
        .map_err(|_| AppError::new("CRYPTO", "Password protection is unavailable."))?;
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|_| AppError::new("CRYPTO", "Password protection failed."))?;
    Ok(key)
}
fn seal(key: &[u8], nonce: &[u8], bytes: &[u8]) -> Result<String> {
    Ok(STANDARD.encode(
        XChaCha20Poly1305::new_from_slice(key)
            .map_err(|_| AppError::new("CRYPTO", "Invalid key."))?
            .encrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: bytes,
                    aad: AAD,
                },
            )
            .map_err(|_| AppError::new("CRYPTO", "Encryption failed. No changes were saved."))?,
    ))
}
fn decode(s: &str, length: Option<usize>) -> Result<Vec<u8>> {
    let b = STANDARD.decode(s).map_err(|_| invalid())?;
    if length.is_some_and(|n| n != b.len()) {
        return Err(invalid());
    }
    Ok(b)
}
fn invalid() -> AppError {
    AppError::new(
        "INVALID_BACKUP",
        "This file is damaged or is not a Money Manager V3 vault.",
    )
}
fn open(key: &[u8], nonce: &[u8], ciphertext: &str) -> Result<Zeroizing<Vec<u8>>> {
    Ok(Zeroizing::new(
        XChaCha20Poly1305::new_from_slice(key)
            .map_err(|_| invalid())?
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: &decode(ciphertext, None)?,
                    aad: AAD,
                },
            )
            .map_err(|_| {
                AppError::field(
                    "password",
                    "The password is incorrect or the file is damaged.",
                )
            })?,
    ))
}
impl Envelope {
    pub fn new(password: &str, data: &[u8]) -> Result<(Self, Zeroizing<[u8; 32]>)> {
        let key = Zeroizing::new(random::<32>());
        let mut e = Self {
            format: "MoneyManagerVault".into(),
            version: 1,
            saved_at: String::new(),
            salt: String::new(),
            wrapped_key: String::new(),
            key_nonce: String::new(),
            data_nonce: String::new(),
            ciphertext: String::new(),
        };
        e.rewrap(password, key.as_ref())?;
        e.update(key.as_ref(), data)?;
        Ok((e, key))
    }
    pub fn rewrap(&mut self, password: &str, key: &[u8]) -> Result<()> {
        if password.len() < 10 || password.len() > 1024 {
            return Err(AppError::field(
                "password",
                "Use a password of 10 to 1024 characters.",
            ));
        }
        let salt = random::<16>();
        let nonce = random::<24>();
        let wrapping = derive(password, &salt)?;
        self.salt = STANDARD.encode(salt);
        self.key_nonce = STANDARD.encode(nonce);
        self.wrapped_key = seal(wrapping.as_ref(), &nonce, key)?;
        Ok(())
    }
    pub fn update(&mut self, key: &[u8], data: &[u8]) -> Result<()> {
        let nonce = random::<24>();
        self.data_nonce = STANDARD.encode(nonce);
        self.ciphertext = seal(key, &nonce, data)?;
        self.saved_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    }
    pub fn unlock(&self, password: &str) -> Result<(Zeroizing<[u8; 32]>, Zeroizing<Vec<u8>>)> {
        if self.format != "MoneyManagerVault" || self.version != 1 {
            return Err(invalid());
        }
        let salt = decode(&self.salt, Some(16))?;
        let nonce = decode(&self.key_nonce, Some(24))?;
        let wrap = derive(password, &salt)?;
        let mut raw = open(wrap.as_ref(), &nonce, &self.wrapped_key)?;
        if raw.len() != 32 {
            return Err(invalid());
        }
        let mut key = Zeroizing::new([0; 32]);
        key.copy_from_slice(&raw);
        raw.zeroize();
        let data = open(
            key.as_ref(),
            &decode(&self.data_nonce, Some(24))?,
            &self.ciphertext,
        )?;
        Ok((key, data))
    }
    pub fn read(path: &std::path::Path) -> Result<Self> {
        if std::fs::metadata(path)?.len() > 200 * 1024 * 1024 {
            return Err(invalid());
        }
        serde_json::from_slice(&std::fs::read(path)?).map_err(|_| invalid())
    }
    pub fn bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|_| invalid())
    }
}
