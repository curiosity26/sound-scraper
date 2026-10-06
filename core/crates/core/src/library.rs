//! Recording library (docs/design.md §5).
//!
//! The recordings folder is the source of truth. A SQLite index caches each
//! file's duration and tags, keyed by name and invalidated by size and
//! modification time, so listing stays fast. The index is rebuilt from the
//! folder if it is missing, and a watcher reports outside changes.

use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, UNIX_EPOCH},
};

use notify_debouncer_mini::{
    DebounceEventResult, Debouncer, new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
};
use rusqlite::{Connection, OptionalExtension, params};

use crate::{
    mp3, paths,
    tags::{self, TagEdit, TagFields, TagVersion},
};

const SCHEMA_VERSION: i64 = 1;

/// One recording, as shown in the library table.
#[derive(Debug, Clone, PartialEq)]
pub struct Recording {
    /// File name inside the recordings folder, e.g. `Music 2026-10-03 14-05.mp3`.
    pub file_name: String,
    pub path: PathBuf,
    /// ID3 title, or the file stem when untagged.
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: u64,
    pub size_bytes: u64,
    /// Recording date: the ID3 date if present, else the file's mtime.
    pub recorded_at_ms: i64,
}

pub type Trasher = Box<dyn Fn(&Path) -> Result<(), String> + Send>;

pub struct Library {
    dir: PathBuf,
    /// Extracted cover images, for the UI to display.
    covers_dir: PathBuf,
    db: Connection,
    trasher: Trasher,
    watcher: Option<Debouncer<RecommendedWatcher>>,
}

impl Library {
    /// The default library: `~/Music/Sound Scraper`, indexed in the app data folder.
    pub fn open_default() -> Result<Self, String> {
        let db_dir = paths::app_data_dir();
        std::fs::create_dir_all(&db_dir).map_err(|e| format!("creating {}: {e}", db_dir.display()))?;
        Self::open(crate::settings::load().recordings_dir(), &db_dir.join("library.db"), Box::new(move_to_trash))
    }

    pub fn open(dir: PathBuf, db_path: &Path, trasher: Trasher) -> Result<Self, String> {
        std::fs::create_dir_all(&dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
        let db = Connection::open(db_path).map_err(|e| format!("opening {}: {e}", db_path.display()))?;
        migrate(&db).map_err(|e| format!("preparing the library index: {e}"))?;
        let covers_dir = db_path.parent().unwrap_or(Path::new(".")).join("covers");
        Ok(Self { dir, covers_dir, db, trasher, watcher: None })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Points the library at another folder (after a settings change). The
    /// index is cleared and rebuilt on the next list; a running watcher
    /// follows the new folder through `rewatch`.
    pub fn set_dir(&mut self, dir: PathBuf) -> Result<(), String> {
        if dir == self.dir {
            return Ok(());
        }
        std::fs::create_dir_all(&dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
        self.db.execute("DELETE FROM recordings", []).map_err(|e| format!("library index: {e}"))?;
        let old = std::mem::replace(&mut self.dir, dir);
        if let Some(watcher) = self.watcher.as_mut() {
            let _ = watcher.watcher().unwatch(&old);
            // Re-register on the new folder (the callback is kept).
            watcher
                .watcher()
                .watch(&self.dir, RecursiveMode::NonRecursive)
                .map_err(|e| format!("watching {}: {e}", self.dir.display()))?;
        }
        Ok(())
    }

    /// Scans the folder, refreshing the index for new or changed files and
    /// dropping removed ones. Sorted newest first.
    pub fn list(&mut self) -> Result<Vec<Recording>, String> {
        let sql_err = |e: rusqlite::Error| format!("library index: {e}");
        let mut on_disk = Vec::new();
        for entry in std::fs::read_dir(&self.dir).map_err(|e| format!("reading {}: {e}", self.dir.display()))? {
            let Ok(entry) = entry else { continue };
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_recording(&name) {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_file() {
                on_disk.push((name, meta.len(), mtime_ms(&meta)));
            }
        }

        let tx = self.db.transaction().map_err(sql_err)?;
        let mut recordings = Vec::with_capacity(on_disk.len());
        for (name, size, mtime) in &on_disk {
            let cached = tx
                .query_row(
                    "SELECT title, artist, album, duration_ms, recorded_at_ms FROM recordings
                     WHERE file_name = ?1 AND size_bytes = ?2 AND mtime_ms = ?3",
                    params![name, *size as i64, mtime],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)?, r.get(4)?)),
                )
                .optional()
                .map_err(sql_err)?;
            let path = self.dir.join(name);
            let (title, artist, album, duration_ms, recorded_at_ms) = match cached {
                Some((title, artist, album, duration_ms, recorded_at)) => {
                    (title, artist, album, duration_ms as u64, recorded_at)
                }
                None => {
                    let info = read_file_info(&path, name, *mtime);
                    tx.execute(
                        "INSERT OR REPLACE INTO recordings
                         (file_name, size_bytes, mtime_ms, title, artist, album, duration_ms, recorded_at_ms)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![
                            name,
                            *size as i64,
                            mtime,
                            info.0,
                            info.1,
                            info.2,
                            info.3 as i64,
                            info.4
                        ],
                    )
                    .map_err(sql_err)?;
                    info
                }
            };
            recordings.push(Recording {
                file_name: name.clone(),
                path,
                title,
                artist,
                album,
                duration_ms,
                size_bytes: *size,
                recorded_at_ms,
            });
        }

        // Forget files that are gone.
        let names: Vec<String> = {
            let mut stmt = tx.prepare("SELECT file_name FROM recordings").map_err(sql_err)?;
            stmt.query_map([], |r| r.get(0)).map_err(sql_err)?.filter_map(Result::ok).collect()
        };
        for name in names.iter().filter(|n| !on_disk.iter().any(|(d, ..)| d == *n)) {
            tx.execute("DELETE FROM recordings WHERE file_name = ?1", [name]).map_err(sql_err)?;
        }
        tx.commit().map_err(sql_err)?;

        recordings.sort_by(|a, b| b.recorded_at_ms.cmp(&a.recorded_at_ms).then_with(|| a.file_name.cmp(&b.file_name)));
        Ok(recordings)
    }

    /// Renames a recording on disk. The new name is sanitized, keeps the
    /// `.mp3` extension and gets " (2)" etc. on collision. If the ID3 title
    /// still matched the old name, it is updated too. Returns the new file name.
    pub fn rename(&mut self, file_name: &str, new_name: &str) -> Result<String, String> {
        let from = self.existing(file_name)?;
        let old_stem = stem(file_name);
        let requested = new_name.trim();
        let requested = requested.strip_suffix(".mp3").or_else(|| requested.strip_suffix(".MP3")).unwrap_or(requested);
        let new_stem = paths::sanitize(requested);
        if new_stem == old_stem {
            return Ok(file_name.to_string());
        }
        // A case-only change is the same file on case-insensitive volumes.
        let to = if new_stem.eq_ignore_ascii_case(&old_stem) {
            self.dir.join(format!("{new_stem}.mp3"))
        } else {
            paths::unique_path(&self.dir, &new_stem, ".mp3", &[crate::recorder::PART_EXT])
        };
        std::fs::rename(&from, &to).map_err(|e| format!("renaming {file_name}: {e}"))?;
        let final_stem = stem(&to.file_name().unwrap().to_string_lossy());
        crate::edit::edits::rename_draft(file_name, &to.file_name().unwrap().to_string_lossy());
        update_title_if_default(&to, &old_stem, &final_stem)?;
        self.db
            .execute("DELETE FROM recordings WHERE file_name = ?1", [file_name])
            .map_err(|e| format!("library index: {e}"))?;
        Ok(to.file_name().unwrap().to_string_lossy().into_owned())
    }

    /// Moves a recording to the Trash / Recycle Bin.
    pub fn trash(&mut self, file_name: &str) -> Result<(), String> {
        let path = self.existing(file_name)?;
        (self.trasher)(&path)?;
        self.db
            .execute("DELETE FROM recordings WHERE file_name = ?1", [file_name])
            .map_err(|e| format!("library index: {e}"))?;
        Ok(())
    }

    /// The recording's editable tags.
    pub fn read_tags(&self, file_name: &str) -> Result<TagFields, String> {
        tags::read(&self.existing(file_name)?)
    }

    /// Writes the embedded cover to the cover cache and returns its path, or
    /// `None` if the recording has no cover. Files are named by content, so
    /// an unchanged cover is written once.
    pub fn export_cover(&self, file_name: &str) -> Result<Option<PathBuf>, String> {
        let Some((mime, data)) = tags::read_cover(&self.existing(file_name)?) else { return Ok(None) };
        std::fs::create_dir_all(&self.covers_dir).map_err(|e| format!("creating {}: {e}", self.covers_dir.display()))?;
        let path = self.covers_dir.join(format!("{:016x}.{}", fnv1a(&data), tags::cover_extension(&mime)));
        if !path.exists() {
            std::fs::write(&path, &data).map_err(|e| format!("writing {}: {e}", path.display()))?;
        }
        Ok(Some(path))
    }

    /// Applies one edit to several recordings (bulk edit). All names are
    /// checked first; each file is then written atomically. Returns the first
    /// error after attempting every file.
    pub fn write_tags(&mut self, file_names: &[String], edit: &TagEdit, version: TagVersion) -> Result<(), String> {
        let paths: Vec<PathBuf> = file_names.iter().map(|n| self.existing(n)).collect::<Result<_, _>>()?;
        let mut first_error = None;
        for (name, path) in file_names.iter().zip(&paths) {
            if let Err(e) = tags::write(path, edit, version) {
                first_error.get_or_insert(format!("{name}: {e}"));
            }
            // Re-read on the next list, whatever happened.
            self.db
                .execute("DELETE FROM recordings WHERE file_name = ?1", [name])
                .map_err(|e| format!("library index: {e}"))?;
        }
        first_error.map_or(Ok(()), Err)
    }

    /// Shows the recording selected in Finder / Explorer.
    pub fn reveal(&self, file_name: &str) -> Result<(), String> {
        reveal_in_file_manager(&self.existing(file_name)?)
    }

    /// Calls `on_change` (from a watcher thread, debounced ~300 ms) when the
    /// folder's contents change. Replaces any previous watcher.
    pub fn watch(&mut self, on_change: impl Fn() + Send + 'static) -> Result<(), String> {
        self.watcher = None;
        // Any change counts: on macOS (kqueue) the reported path is just a
        // guess at which entry changed, and re-listing is cheap with the index.
        let mut debouncer = new_debouncer(Duration::from_millis(300), move |_: DebounceEventResult| on_change())
        .map_err(|e| format!("starting the folder watcher: {e}"))?;
        debouncer
            .watcher()
            .watch(&self.dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watching {}: {e}", self.dir.display()))?;
        self.watcher = Some(debouncer);
        Ok(())
    }

    pub fn unwatch(&mut self) {
        self.watcher = None;
    }

    /// Resolves a file name from the UI to a path inside the folder.
    fn existing(&self, file_name: &str) -> Result<PathBuf, String> {
        let plain = Path::new(file_name).file_name().is_some_and(|n| n == file_name);
        if !plain || !is_recording(file_name) {
            return Err(format!("not a recording name: {file_name}"));
        }
        let path = self.dir.join(file_name);
        if !path.is_file() {
            return Err(format!("{file_name} no longer exists"));
        }
        Ok(path)
    }
}

fn migrate(db: &Connection) -> rusqlite::Result<()> {
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version != SCHEMA_VERSION {
        // It's only a cache: rebuild it from the folder.
        db.execute_batch(&format!(
            "DROP TABLE IF EXISTS recordings;
             CREATE TABLE recordings (
                 file_name      TEXT PRIMARY KEY,
                 size_bytes     INTEGER NOT NULL,
                 mtime_ms       INTEGER NOT NULL,
                 title          TEXT NOT NULL,
                 artist         TEXT,
                 album          TEXT,
                 duration_ms    INTEGER NOT NULL,
                 recorded_at_ms INTEGER NOT NULL
             );
             PRAGMA user_version = {SCHEMA_VERSION};"
        ))?;
    }
    Ok(())
}

/// Finished recordings only (in-progress `.mp3.part` files are excluded).
fn is_recording(name: &str) -> bool {
    !name.starts_with('.') && name.to_ascii_lowercase().ends_with(".mp3")
}

fn stem(file_name: &str) -> String {
    Path::new(file_name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

fn mtime_ms(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64)
}

type FileInfo = (String, Option<String>, Option<String>, u64, i64);

/// (title, artist, album, duration_ms, recorded_at_ms) from the file itself.
fn read_file_info(path: &Path, file_name: &str, mtime_ms: i64) -> FileInfo {
    use id3::TagLike;
    let tag = id3::Tag::read_from_path(path).ok();
    let title = tag.as_ref().and_then(|t| t.title()).map(str::to_string).unwrap_or_else(|| stem(file_name));
    let artist = tag.as_ref().and_then(|t| t.artist()).map(str::to_string);
    let album = tag.as_ref().and_then(|t| t.album()).map(str::to_string);
    let recorded_at = tag
        .as_ref()
        .and_then(|t| t.date_recorded())
        .and_then(timestamp_ms)
        .unwrap_or(mtime_ms);
    let duration_ms = mp3::scan(path).map(|s| (s.duration_secs() * 1000.0).round() as u64).unwrap_or(0);
    (title, artist, album, duration_ms, recorded_at)
}

fn timestamp_ms(t: id3::Timestamp) -> Option<i64> {
    use chrono::{Local, NaiveDate, TimeZone};
    let date = NaiveDate::from_ymd_opt(t.year, u32::from(t.month?), u32::from(t.day.unwrap_or(1)))?;
    let time = date.and_hms_opt(
        u32::from(t.hour.unwrap_or(0)),
        u32::from(t.minute.unwrap_or(0)),
        u32::from(t.second.unwrap_or(0)),
    )?;
    Local.from_local_datetime(&time).earliest().map(|dt| dt.timestamp_millis())
}

/// Updates the ID3 title to `new_stem` if it was still the default (the old
/// file name), so user-entered titles are never overwritten.
fn update_title_if_default(path: &Path, old_stem: &str, new_stem: &str) -> Result<(), String> {
    use id3::TagLike;
    let Ok(mut tag) = id3::Tag::read_from_path(path) else { return Ok(()) };
    if tag.title() != Some(old_stem) {
        return Ok(());
    }
    tag.set_title(new_stem);
    let version = tag.version();
    tag.write_to_path(path, version).map_err(|e| format!("updating the title tag: {e}"))
}

/// Stable 64-bit FNV-1a, for content-addressed cover file names.
fn fnv1a(data: &[u8]) -> u64 {
    data.iter().fold(0xcbf2_9ce4_8422_2325, |h, &b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3))
}

fn move_to_trash(path: &Path) -> Result<(), String> {
    #[allow(unused_mut)]
    let mut trash = trash::TrashContext::default();
    // The default asks Finder over AppleScript, which blocks on an
    // Automation permission prompt; NSFileManager needs no permission.
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        trash.set_delete_method(DeleteMethod::NsFileManager);
    }
    trash.delete(path).map_err(|e| format!("moving {} to the Trash: {e}", path.display()))
}

fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg("-R").arg(path).status();
    #[cfg(target_os = "windows")]
    return reveal_windows(path);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = std::process::Command::new("xdg-open").arg(path.parent().unwrap_or(path)).status();
    #[cfg(not(target_os = "windows"))]
    status.map(|_| ()).map_err(|e| format!("showing {}: {e}", path.display()))
}

/// Opens Explorer on the folder with the file selected. Uses the Shell API
/// (works from packaged apps, no command-line quoting) on its own STA thread.
#[cfg(target_os = "windows")]
fn reveal_windows(path: &Path) -> Result<(), String> {
    use windows::{
        Win32::{
            System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize},
            UI::Shell::{ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems},
        },
        core::HSTRING,
    };
    let wide = HSTRING::from(path.as_os_str());
    let shown = path.display().to_string();
    std::thread::spawn(move || unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let pidl = ILCreateFromPathW(&wide);
        let result = if pidl.is_null() {
            Err(format!("showing {shown}: path not found"))
        } else {
            let r = SHOpenFolderAndSelectItems(pidl, None, 0).map_err(|e| format!("showing {shown}: {e}"));
            ILFree(Some(pidl));
            r
        };
        if com.is_ok() {
            CoUninitialize();
        }
        result
    })
    .join()
    .unwrap_or_else(|_| Err("showing the file panicked".into()))
}

/// For tests and tools: blocks until `on_change` fires or the timeout passes.
#[doc(hidden)]
pub fn wait_for_change(library: &mut Library, timeout: Duration, change: impl FnOnce()) -> bool {
    let (tx, rx) = mpsc::channel();
    let tx = std::sync::Mutex::new(tx);
    if library.watch(move || {
        let _ = tx.lock().unwrap().send(());
    })
    .is_err()
    {
        return false;
    }
    std::thread::sleep(Duration::from_millis(100));
    change();
    rx.recv_timeout(timeout).is_ok()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use id3::TagLike;

    use super::*;
    use crate::mp3::tests::{encode_all, sine};

    struct Fixture {
        dir: PathBuf,
        library: Library,
        trashed: Arc<Mutex<Vec<PathBuf>>>,
    }

    fn fixture() -> Fixture {
        let root = paths::tempdir();
        let dir = root.join("Sound Scraper");
        let trashed = Arc::new(Mutex::new(Vec::new()));
        let record = trashed.clone();
        let library = Library::open(
            dir.clone(),
            &root.join("library.db"),
            Box::new(move |p: &Path| {
                record.lock().unwrap().push(p.to_owned());
                std::fs::remove_file(p).map_err(|e| e.to_string())
            }),
        )
        .unwrap();
        Fixture { dir, library, trashed }
    }

    /// Writes a tagged MP3 of `seconds` named `<stem>.mp3`.
    fn add(dir: &Path, stem: &str, seconds: f64, title: Option<&str>) -> PathBuf {
        let path = dir.join(format!("{stem}.mp3"));
        std::fs::write(&path, encode_all(&sine(seconds, 48000), 48000, true)).unwrap();
        if let Some(title) = title {
            let mut tag = id3::Tag::new();
            tag.set_title(title);
            tag.set_artist("Someone");
            tag.set_date_recorded(id3::Timestamp {
                year: 2026,
                month: Some(10),
                day: Some(1),
                hour: Some(14),
                minute: Some(5),
                second: None,
            });
            tag.write_to_path(&path, id3::Version::Id3v24).unwrap();
        }
        path
    }

    #[test]
    fn lists_recordings_with_metadata_newest_first() {
        let mut f = fixture();
        add(&f.dir, "Music 2026-10-03 14-05", 1.0, Some("Music 2026-10-03 14-05"));
        add(&f.dir, "Untagged", 2.0, None); // mtime = now, so newest
        std::fs::write(f.dir.join("Live.mp3.part"), b"in progress").unwrap();
        std::fs::write(f.dir.join("notes.txt"), b"").unwrap();

        let list = f.library.list().unwrap();
        assert_eq!(list.iter().map(|r| r.file_name.as_str()).collect::<Vec<_>>(), [
            "Untagged.mp3",
            "Music 2026-10-03 14-05.mp3"
        ]);
        let untagged = &list[0];
        assert_eq!((untagged.title.as_str(), untagged.artist.as_deref()), ("Untagged", None));
        assert!((untagged.duration_ms as i64 - 2000).abs() < 100, "{}", untagged.duration_ms);
        let tagged = &list[1];
        assert_eq!(tagged.artist.as_deref(), Some("Someone"));
        assert!((tagged.duration_ms as i64 - 1000).abs() < 100);
        assert_eq!(tagged.recorded_at_ms, timestamp_ms(id3::Timestamp {
            year: 2026,
            month: Some(10),
            day: Some(1),
            hour: Some(14),
            minute: Some(5),
            second: None
        })
        .unwrap());
        assert_eq!(tagged.size_bytes, std::fs::metadata(&tagged.path).unwrap().len());
    }

    #[test]
    fn index_is_reused_and_pruned() {
        let mut f = fixture();
        let path = add(&f.dir, "A", 1.0, Some("A"));
        f.library.list().unwrap();
        // Change the cached title behind the file's back: a reused row keeps it.
        f.library.db.execute("UPDATE recordings SET title = 'cached'", []).unwrap();
        assert_eq!(f.library.list().unwrap()[0].title, "cached");
        // Removing the file prunes its row.
        std::fs::remove_file(&path).unwrap();
        assert!(f.library.list().unwrap().is_empty());
        let rows: i64 = f.library.db.query_row("SELECT COUNT(*) FROM recordings", [], |r| r.get(0)).unwrap();
        assert_eq!(rows, 0);
    }

    #[test]
    fn rename_sanitizes_avoids_collisions_and_updates_default_title() {
        let mut f = fixture();
        add(&f.dir, "Music 2026-10-03 14-05", 0.5, Some("Music 2026-10-03 14-05"));
        add(&f.dir, "Taken", 0.5, Some("Taken"));

        let renamed = f.library.rename("Music 2026-10-03 14-05.mp3", "Taken.mp3").unwrap();
        assert_eq!(renamed, "Taken (2).mp3");
        let tag = id3::Tag::read_from_path(f.dir.join(&renamed)).unwrap();
        assert_eq!(tag.title(), Some("Taken (2)"));
        assert_eq!(tag.artist(), Some("Someone"), "other tags survive");

        let renamed = f.library.rename("Taken (2).mp3", "  AC/DC: Live?  ").unwrap();
        assert_eq!(renamed, "AC_DC_ Live_.mp3");
        assert!(!f.dir.join("Taken (2).mp3").exists());

        let names: Vec<_> = f.library.list().unwrap().into_iter().map(|r| r.file_name).collect();
        assert!(names.contains(&"AC_DC_ Live_.mp3".to_string()) && names.contains(&"Taken.mp3".to_string()));
    }

    #[test]
    fn rename_keeps_a_custom_title() {
        let mut f = fixture();
        add(&f.dir, "Music 2026-10-03 14-05", 0.5, Some("My favourite song"));
        let renamed = f.library.rename("Music 2026-10-03 14-05.mp3", "Favourite").unwrap();
        let tag = id3::Tag::read_from_path(f.dir.join(renamed)).unwrap();
        assert_eq!(tag.title(), Some("My favourite song"));
    }

    #[test]
    fn rename_and_trash_reject_bad_names() {
        let mut f = fixture();
        add(&f.dir, "A", 0.5, None);
        assert!(f.library.rename("../A.mp3", "B").is_err());
        assert!(f.library.rename("Missing.mp3", "B").is_err());
        assert!(f.library.trash("A.mp3.part").is_err());
        assert_eq!(f.library.rename("A.mp3", "A").unwrap(), "A.mp3");
    }

    #[test]
    fn trash_uses_the_trasher_and_forgets_the_file() {
        let mut f = fixture();
        let path = add(&f.dir, "Old", 0.5, None);
        f.library.list().unwrap();
        f.library.trash("Old.mp3").unwrap();
        assert_eq!(*f.trashed.lock().unwrap(), [path]);
        assert!(f.library.list().unwrap().is_empty());
    }

    #[test]
    fn bulk_tag_edit_updates_only_the_given_fields_and_the_list() {
        let mut f = fixture();
        add(&f.dir, "One", 0.3, Some("One"));
        add(&f.dir, "Two", 0.3, Some("Two"));
        f.library.list().unwrap();
        let cover = f.dir.join("cover.png");
        std::fs::write(&cover, crate::tags::tests::PNG_1X1).unwrap();

        let edit = TagEdit {
            album: Some(Some("Shared".into())),
            artist: Some(None),
            cover: crate::tags::CoverEdit::Set(cover),
            ..Default::default()
        };
        f.library.write_tags(&["One.mp3".into(), "Two.mp3".into()], &edit, TagVersion::V24).unwrap();

        let list = f.library.list().unwrap();
        for (name, title) in [("One.mp3", "One"), ("Two.mp3", "Two")] {
            let r = list.iter().find(|r| r.file_name == name).unwrap();
            assert_eq!((r.title.as_str(), r.album.as_deref(), r.artist.as_deref()), (title, Some("Shared"), None));
            assert!(f.library.read_tags(name).unwrap().has_cover);
        }
        let exported = f.library.export_cover("One.mp3").unwrap().unwrap();
        assert_eq!(std::fs::read(&exported).unwrap(), crate::tags::tests::PNG_1X1);
        assert_eq!(f.library.export_cover("Two.mp3").unwrap().unwrap(), exported, "same image, same cache file");
    }

    #[test]
    fn bulk_tag_edit_checks_every_name_first() {
        let mut f = fixture();
        add(&f.dir, "One", 0.3, Some("One"));
        let edit = TagEdit { album: Some(Some("X".into())), ..Default::default() };
        assert!(f.library.write_tags(&["One.mp3".into(), "Missing.mp3".into()], &edit, TagVersion::V24).is_err());
        assert_eq!(f.library.read_tags("One.mp3").unwrap().album, None, "nothing written");
    }

    #[test]
    fn set_dir_lists_the_new_folder() {
        let mut f = fixture();
        add(&f.dir, "Old", 0.3, None);
        assert_eq!(f.library.list().unwrap().len(), 1);
        let other = paths::tempdir().join("Elsewhere");
        f.library.set_dir(other.clone()).unwrap();
        assert!(f.library.list().unwrap().is_empty());
        add(&other, "New", 0.3, None);
        let names: Vec<_> = f.library.list().unwrap().into_iter().map(|r| r.file_name).collect();
        assert_eq!(names, ["New.mp3"]);
    }

    #[test]
    fn watcher_reports_new_recordings() {
        let mut f = fixture();
        let dir = f.dir.clone();
        let fired = wait_for_change(&mut f.library, Duration::from_secs(5), move || {
            add(&dir, "New", 0.2, None);
        });
        assert!(fired, "no change notification");
    }
}
