use crate::{
    crypto::Envelope,
    error::{AppError, Result},
    ledger,
    models::*,
    storage,
};
use rusqlite::Connection;
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::Instant,
};
use zeroize::Zeroizing;
pub struct Active {
    pub db: Connection,
    pub key: Zeroizing<[u8; 32]>,
    pub envelope: Envelope,
    pub touched: Instant,
}
pub struct Restore {
    pub active: Active,
    pub preview: RestorePreview,
}
pub struct Vault {
    pub path: PathBuf,
    pub active: Option<Active>,
    pub imports: HashMap<String, (ImportPreview, ImportMapping)>,
    pub restores: HashMap<String, Restore>,
    pub migration: Option<(String, Zeroizing<Vec<u8>>)>,
}
pub fn atomic_write(path: &Path, bytes: &[u8], replace: bool) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("FILE_IO", "Choose a valid destination."))?;
    if !parent.is_dir() {
        return Err(AppError::new(
            "FILE_IO",
            "The destination folder is unavailable.",
        ));
    }
    if !replace && path.exists() {
        return Err(AppError::new(
            "FILE_EXISTS",
            "This destination already exists. Choose a new filename.",
        ));
    }
    let temp = parent.join(format!(".{}.tmp", ledger::id()));
    let result = (|| -> Result<()> {
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        if replace {
            fs::rename(&temp, path)?;
        } else {
            fs::hard_link(&temp, path)?;
            fs::remove_file(&temp)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
impl Vault {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            active: None,
            imports: HashMap::new(),
            restores: HashMap::new(),
            migration: None,
        }
    }
    pub fn session(&self) -> Result<Session> {
        Ok(Session {
            status: if self.active.is_some() {
                "unlocked"
            } else if self.path.exists() {
                "locked"
            } else {
                "setup"
            }
            .into(),
            config: self
                .active
                .as_ref()
                .map(|a| ledger::config(&a.db))
                .transpose()?,
            version: env!("CARGO_PKG_VERSION").into(),
        })
    }
    fn expire(&mut self) -> Result<()> {
        let expired = if let Some(a) = &self.active {
            let minutes = ledger::config(&a.db)?.inactivity_minutes;
            minutes > 0 && a.touched.elapsed().as_secs() >= u64::from(minutes) * 60
        } else {
            false
        };
        if expired {
            self.lock();
        }
        Ok(())
    }
    pub fn touch_session(&mut self) -> Result<Session> {
        self.expire()?;
        if let Some(active) = self.active.as_mut() {
            active.touched = Instant::now();
        }
        self.session()
    }
    pub fn require(&mut self) -> Result<&mut Active> {
        self.expire()?;
        let a = self
            .active
            .as_mut()
            .ok_or_else(|| AppError::new("VAULT_LOCKED", "Unlock your vault to continue."))?;
        a.touched = Instant::now();
        Ok(a)
    }
    pub fn read<T>(&mut self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        f(&self.require()?.db)
    }
    pub fn write<T>(&mut self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let path = self.path.clone();
        let a = self.require()?;
        let disk = Envelope::read(&path)?;
        if disk.ciphertext != a.envelope.ciphertext || disk.wrapped_key != a.envelope.wrapped_key {
            return Err(AppError::new("VAULT_CHANGED","The saved vault changed outside this session. Lock and unlock it again before saving."));
        }
        let bytes = Zeroizing::new(storage::image(&a.db)?);
        let mut candidate = storage::from_image(&bytes)?;
        let tx = candidate.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        storage::validate(&candidate)?;
        let mut envelope = a.envelope.clone();
        let image = Zeroizing::new(storage::image(&candidate)?);
        envelope.update(a.key.as_ref(), &image)?;
        atomic_write(&path, &envelope.bytes()?, true)?;
        a.db = candidate;
        a.envelope = envelope;
        self.migration = None;
        Ok(result)
    }
    pub fn setup(&mut self, r: Setup) -> Result<Session> {
        if self.path.exists() {
            return Err(AppError::new(
                "VAULT_EXISTS",
                "A vault already exists. Unlock it or use restore.",
            ));
        }
        let n = ledger::name(&r.name, "name")?;
        if !["EUR", "USD", "GBP", "CHF", "CAD", "AUD"].contains(&r.currency.as_str()) {
            return Err(AppError::field("currency", "Choose a supported currency."));
        }
        if !["en-GB", "en-US", "it-IT", "de-DE", "fr-FR"].contains(&r.locale.as_str())
            || !["DMY", "MDY", "ISO"].contains(&r.date_format.as_str())
        {
            return Err(AppError::field(
                "locale",
                "Choose valid display preferences.",
            ));
        }
        let cfg = Config {
            name: n,
            currency: r.currency,
            locale: r.locale,
            date_format: r.date_format,
            theme: "light".into(),
            inactivity_minutes: 15,
            last_backup: None,
        };
        let mut c = storage::fresh()?;
        let tx = c.transaction()?;
        ledger::set_config(&tx, &cfg)?;
        tx.execute(
            "INSERT INTO currencies(code,minor_digits) VALUES(?1,2)",
            [&cfg.currency],
        )?;
        ledger::seed(&tx)?;
        ledger::create_account(&tx, &r.account)?;
        tx.commit()?;
        let image = Zeroizing::new(storage::image(&c)?);
        let password = Zeroizing::new(r.password);
        let (e, key) = Envelope::new(&password, &image)?;
        atomic_write(&self.path, &e.bytes()?, false)?;
        self.active = Some(Active {
            db: c,
            key,
            envelope: e,
            touched: Instant::now(),
        });
        self.session()
    }
    pub fn unlock(&mut self, password: String) -> Result<Session> {
        let password = Zeroizing::new(password);
        let e = Envelope::read(&self.path)?;
        let (key, bytes) = e.unlock(&password)?;
        let db = storage::from_image(&bytes)?;
        ledger::config(&db)?;
        self.active = Some(Active {
            db,
            key,
            envelope: e,
            touched: Instant::now(),
        });
        self.session()
    }
    pub fn lock(&mut self) {
        self.active = None;
        self.imports.clear();
        self.restores.clear();
        self.migration = None;
    }
    pub fn change_password(&mut self, current: String, new: String) -> Result<()> {
        let current = Zeroizing::new(current);
        let new = Zeroizing::new(new);
        let path = self.path.clone();
        let a = self.require()?;
        a.envelope.unlock(&current)?;
        let mut e = a.envelope.clone();
        e.rewrap(&new, a.key.as_ref())?;
        atomic_write(&path, &e.bytes()?, true)?;
        a.envelope = e;
        Ok(())
    }
    pub fn save_config(&mut self, cfg: Config) -> Result<()> {
        self.write(|c| {
            let old = ledger::config(c)?;
            if cfg.currency != old.currency {
                return Err(AppError::field(
                    "currency",
                    "The currency is fixed for this vault.",
                ));
            }
            ledger::name(&cfg.name, "name")?;
            if !["light", "dark", "system"].contains(&cfg.theme.as_str())
                || !["DMY", "MDY", "ISO"].contains(&cfg.date_format.as_str())
                || !["en-GB", "en-US", "it-IT", "de-DE", "fr-FR"].contains(&cfg.locale.as_str())
                || cfg.inactivity_minutes > 240
            {
                return Err(AppError::field(
                    "theme",
                    "Choose valid appearance and security settings.",
                ));
            }
            let mut cfg = cfg;
            cfg.last_backup = old.last_backup;
            ledger::set_config(c, &cfg)
        })
    }
    pub fn export(&mut self, path: &Path, bytes: &[u8]) -> Result<String> {
        self.require()?;
        if path == self.path {
            return Err(AppError::new(
                "DESTINATION",
                "Choose a destination outside the active vault.",
            ));
        }
        atomic_write(path, bytes, false)?;
        Ok(path.display().to_string())
    }
    pub fn backup(&mut self, path: &Path) -> Result<String> {
        if path == self.path {
            return Err(AppError::new(
                "DESTINATION",
                "Choose a new backup destination.",
            ));
        }
        let e = self.require()?.envelope.clone();
        atomic_write(path, &e.bytes()?, false)?;
        let when = chrono::Utc::now().to_rfc3339();
        self.write(|c| {
            let mut cfg = ledger::config(c)?;
            cfg.last_backup = Some(format!("{when} · {}", path.display()));
            ledger::set_config(c, &cfg)
        })?;
        Ok(path.display().to_string())
    }
    pub fn preview_restore(&mut self, path: &Path, password: String) -> Result<RestorePreview> {
        let password = Zeroizing::new(password);
        let e = Envelope::read(path)?;
        let (key, bytes) = e.unlock(&password)?;
        let db = storage::from_image(&bytes)?;
        let cfg = ledger::config(&db)?;
        let token = ledger::id();
        let preview = RestorePreview {
            token: token.clone(),
            name: cfg.name,
            currency: cfg.currency,
            backup_date: e.saved_at.clone(),
            account_count: ledger::list_accounts(&db)?.len() as u32,
            transaction_count: db.query_row(
                "SELECT COUNT(*) FROM journal_entries WHERE kind NOT IN ('opening','reversal')",
                [],
                |r| r.get(0),
            )?,
        };
        self.restores.clear();
        self.restores.insert(
            token,
            Restore {
                active: Active {
                    db,
                    key,
                    envelope: e,
                    touched: Instant::now(),
                },
                preview: preview.clone(),
            },
        );
        Ok(preview)
    }
    pub fn commit_restore(&mut self, token: &str) -> Result<Session> {
        let restore = self.restores.get(token).ok_or_else(|| {
            AppError::new(
                "PREVIEW_EXPIRED",
                "Validate the backup again before restoring.",
            )
        })?;
        storage::validate(&restore.active.db)?;
        if self.path.exists() {
            let safety = self
                .path
                .with_file_name(format!("pre-restore-{}.vault", ledger::id()));
            atomic_write(&safety, &fs::read(&self.path)?, false)?;
        }
        atomic_write(&self.path, &restore.active.envelope.bytes()?, true)?;
        let restore = self.restores.remove(token).unwrap();
        self.active = Some(restore.active);
        self.imports.clear();
        self.session()
    }
    pub fn preview_v2(&mut self, path: &Path) -> Result<MigrationPreview> {
        let cfg = self.read(ledger::config)?;
        let (p, candidate) = crate::migration::preview(path, &cfg)?;
        self.migration = if let Some(c) = candidate {
            Some((p.token.clone(), Zeroizing::new(storage::image(&c)?)))
        } else {
            None
        };
        Ok(p)
    }
    pub fn commit_v2(&mut self, token: &str) -> Result<Session> {
        self.require()?;
        let (key, bytes) = self.migration.as_ref().ok_or_else(|| {
            AppError::new(
                "PREVIEW_EXPIRED",
                "Review the V2 source again before migrating.",
            )
        })?;
        if key != token {
            return Err(AppError::new(
                "PREVIEW_EXPIRED",
                "This migration preview has expired.",
            ));
        }
        let candidate = storage::from_image(bytes)?;
        let mut envelope = self.active.as_ref().unwrap().envelope.clone();
        envelope.update(self.active.as_ref().unwrap().key.as_ref(), bytes)?;
        let safety = self
            .path
            .with_file_name(format!("pre-v2-migration-{}.vault", ledger::id()));
        atomic_write(&safety, &fs::read(&self.path)?, false)?;
        atomic_write(&self.path, &envelope.bytes()?, true)?;
        let a = self.active.as_mut().unwrap();
        a.db = candidate;
        a.envelope = envelope;
        self.migration = None;
        self.imports.clear();
        self.session()
    }
}
