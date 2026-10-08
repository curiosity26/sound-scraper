//! Playlists (docs/playlists-and-cd-burning-design.md §5).
//!
//! Unlike the library index, playlists are the user's own data, so they live
//! in their own SQLite file (`playlists.db`, next to `library.db`) that is
//! never rebuilt. Items point at recordings by file name, the library's key;
//! renames and trashing done through the library follow along, and a file
//! that disappears behind the app's back shows as missing in the UI.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Stable within its playlist (a recording can appear more than once).
    pub id: i64,
    pub file_name: String,
}

pub struct Playlists {
    db: Connection,
}

/// `playlists.db` beside the library index (`library.db`).
pub fn db_path_beside(library_db: &Path) -> PathBuf {
    library_db.parent().unwrap_or(Path::new(".")).join("playlists.db")
}

impl Playlists {
    pub fn open_default() -> Result<Self, String> {
        let dir = crate::paths::app_data_dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
        Self::open(&dir.join("playlists.db"))
    }

    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| format!("opening {}: {e}", path.display()))?;
        // The library and editor have their own handles to the same file.
        db.busy_timeout(std::time::Duration::from_secs(3)).map_err(sql)?;
        migrate(&db).map_err(|e| format!("preparing playlists: {e}"))?;
        Ok(Self { db })
    }

    /// Every playlist, by name (case-insensitive).
    pub fn list(&self) -> Result<Vec<Playlist>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT p.id, p.name, COUNT(i.id) FROM playlists p
                 LEFT JOIN playlist_items i ON i.playlist_id = p.id
                 GROUP BY p.id ORDER BY p.name COLLATE NOCASE, p.id",
            )
            .map_err(sql)?;
        let rows = stmt
            .query_map([], |r| Ok(Playlist { id: r.get(0)?, name: r.get(1)?, count: r.get::<_, i64>(2)? as usize }))
            .map_err(sql)?;
        rows.collect::<Result<_, _>>().map_err(sql)
    }

    fn get(&self, id: i64) -> Result<Playlist, String> {
        self.list()?.into_iter().find(|p| p.id == id).ok_or_else(|| "That playlist no longer exists.".to_string())
    }

    /// A new playlist, named `name` or `name (2)`… if taken, holding `file_names`.
    pub fn create(&mut self, name: &str, file_names: &[String]) -> Result<Playlist, String> {
        let name = self.unique_name(&clean_name(name)?, None)?;
        self.db.execute("INSERT INTO playlists (name) VALUES (?1)", [&name]).map_err(sql)?;
        let id = self.db.last_insert_rowid();
        self.add(id, file_names)?;
        self.get(id)
    }

    pub fn rename(&mut self, id: i64, name: &str) -> Result<Playlist, String> {
        self.get(id)?;
        let name = self.unique_name(&clean_name(name)?, Some(id))?;
        self.db.execute("UPDATE playlists SET name = ?1 WHERE id = ?2", params![name, id]).map_err(sql)?;
        self.get(id)
    }

    /// A copy named "<name> copy".
    pub fn duplicate(&mut self, id: i64) -> Result<Playlist, String> {
        let source = self.get(id)?;
        let files: Vec<String> = self.items(id)?.into_iter().map(|i| i.file_name).collect();
        self.create(&format!("{} copy", source.name), &files)
    }

    /// Deletes the playlist (never the recordings).
    pub fn delete(&mut self, id: i64) -> Result<(), String> {
        let tx = self.db.transaction().map_err(sql)?;
        tx.execute("DELETE FROM playlist_items WHERE playlist_id = ?1", [id]).map_err(sql)?;
        tx.execute("DELETE FROM playlists WHERE id = ?1", [id]).map_err(sql)?;
        tx.commit().map_err(sql)
    }

    /// The playlist's items in order.
    pub fn items(&self, id: i64) -> Result<Vec<Item>, String> {
        let mut stmt = self
            .db
            .prepare("SELECT id, file_name FROM playlist_items WHERE playlist_id = ?1 ORDER BY position, id")
            .map_err(sql)?;
        let rows = stmt.query_map([id], |r| Ok(Item { id: r.get(0)?, file_name: r.get(1)? })).map_err(sql)?;
        rows.collect::<Result<_, _>>().map_err(sql)
    }

    /// Appends recordings (duplicates allowed); returns the new items.
    pub fn add(&mut self, id: i64, file_names: &[String]) -> Result<Vec<Item>, String> {
        self.get(id)?;
        for name in file_names {
            check_file_name(name)?;
        }
        let tx = self.db.transaction().map_err(sql)?;
        let mut next: i64 = tx
            .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_items WHERE playlist_id = ?1", [id], |r| {
                r.get(0)
            })
            .map_err(sql)?;
        let mut added = Vec::with_capacity(file_names.len());
        for name in file_names {
            tx.execute(
                "INSERT INTO playlist_items (playlist_id, position, file_name) VALUES (?1, ?2, ?3)",
                params![id, next, name],
            )
            .map_err(sql)?;
            added.push(Item { id: tx.last_insert_rowid(), file_name: name.clone() });
            next += 1;
        }
        tx.commit().map_err(sql)?;
        Ok(added)
    }

    /// Takes items off the playlist (the recordings stay).
    pub fn remove(&mut self, id: i64, item_ids: &[i64]) -> Result<(), String> {
        let tx = self.db.transaction().map_err(sql)?;
        for item in item_ids {
            tx.execute("DELETE FROM playlist_items WHERE playlist_id = ?1 AND id = ?2", params![id, item]).map_err(sql)?;
        }
        tx.commit().map_err(sql)?;
        self.renumber(id)
    }

    /// Reorders: `item_ids` must be exactly the playlist's items, in the new order.
    pub fn set_order(&mut self, id: i64, item_ids: &[i64]) -> Result<(), String> {
        let mut current: Vec<i64> = self.items(id)?.into_iter().map(|i| i.id).collect();
        let mut wanted = item_ids.to_vec();
        current.sort_unstable();
        wanted.sort_unstable();
        if current != wanted {
            return Err("The playlist changed while it was being reordered; try again.".into());
        }
        let tx = self.db.transaction().map_err(sql)?;
        for (position, item) in item_ids.iter().enumerate() {
            tx.execute("UPDATE playlist_items SET position = ?1 WHERE id = ?2", params![position as i64, item])
                .map_err(sql)?;
        }
        tx.commit().map_err(sql)
    }

    /// A recording was renamed: every playlist follows.
    pub fn file_renamed(&mut self, old: &str, new: &str) -> Result<(), String> {
        self.db.execute("UPDATE playlist_items SET file_name = ?1 WHERE file_name = ?2", [new, old]).map_err(sql)?;
        Ok(())
    }

    /// A recording was trashed: it leaves every playlist.
    pub fn file_removed(&mut self, file_name: &str) -> Result<(), String> {
        let ids: Vec<i64> = {
            let mut stmt =
                self.db.prepare("SELECT DISTINCT playlist_id FROM playlist_items WHERE file_name = ?1").map_err(sql)?;
            stmt.query_map([file_name], |r| r.get(0)).map_err(sql)?.collect::<Result<_, _>>().map_err(sql)?
        };
        self.db.execute("DELETE FROM playlist_items WHERE file_name = ?1", [file_name]).map_err(sql)?;
        for id in ids {
            self.renumber(id)?;
        }
        Ok(())
    }

    /// The playlist showing in the library (None = the whole library).
    pub fn active(&self) -> Result<Option<i64>, String> {
        let id: Option<i64> = self
            .db
            .query_row("SELECT value FROM meta WHERE key = 'active'", [], |r| r.get::<_, String>(0))
            .optional()
            .map_err(sql)?
            .and_then(|v| v.parse().ok());
        // Deleted since.
        Ok(id.filter(|id| self.get(*id).is_ok()))
    }

    pub fn set_active(&mut self, id: Option<i64>) -> Result<(), String> {
        match id {
            Some(id) => {
                self.get(id)?;
                self.db
                    .execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('active', ?1)", [id.to_string()])
                    .map_err(sql)?;
            }
            None => {
                self.db.execute("DELETE FROM meta WHERE key = 'active'", []).map_err(sql)?;
            }
        }
        Ok(())
    }

    /// Writes an extended M3U playlist (UTF-8, `.m3u8`) with paths relative
    /// to `out` when the recordings sit beside or below it, absolute
    /// otherwise. Missing recordings are left out; returns how many were.
    pub fn export_m3u8(&self, id: i64, recordings_dir: &Path, out: &Path) -> Result<usize, String> {
        use id3::TagLike;
        let playlist = self.get(id)?;
        let mut text = format!("#EXTM3U\n#PLAYLIST:{}\n", playlist.name);
        let mut missing = 0;
        let base = out.parent().unwrap_or(Path::new(""));
        for item in self.items(id)? {
            let path = recordings_dir.join(&item.file_name);
            if !path.is_file() {
                missing += 1;
                continue;
            }
            let tag = id3::Tag::read_from_path(&path).ok();
            let title = tag.as_ref().and_then(|t| t.title()).map(str::to_string).unwrap_or_else(|| stem(&item.file_name));
            let label = match tag.as_ref().and_then(|t| t.artist()) {
                Some(artist) => format!("{artist} - {title}"),
                None => title,
            };
            let seconds = crate::mp3::scan(&path).map(|s| s.duration_secs().round() as i64).unwrap_or(-1);
            let shown = path.strip_prefix(base).map(Path::to_path_buf).unwrap_or(path);
            text.push_str(&format!("#EXTINF:{seconds},{}\n{}\n", one_line(&label), shown.display()));
        }
        std::fs::write(out, text).map_err(|e| format!("writing {}: {e}", out.display()))?;
        Ok(missing)
    }

    fn renumber(&mut self, id: i64) -> Result<(), String> {
        let ids: Vec<i64> = self.items(id)?.into_iter().map(|i| i.id).collect();
        self.set_order(id, &ids)
    }

    fn unique_name(&self, name: &str, except: Option<i64>) -> Result<String, String> {
        let taken: Vec<String> = self
            .list()?
            .into_iter()
            .filter(|p| Some(p.id) != except)
            .map(|p| p.name.to_lowercase())
            .collect();
        if !taken.contains(&name.to_lowercase()) {
            return Ok(name.to_string());
        }
        Ok((2..).map(|n| format!("{name} ({n})")).find(|c| !taken.contains(&c.to_lowercase())).unwrap())
    }
}

/// Keeps every playlist in step when the library renames or trashes a
/// recording. Failures are logged, not fatal: the file operation succeeded.
pub(crate) fn follow(db: &Path, change: impl FnOnce(&mut Playlists) -> Result<(), String>) {
    if !db.exists() {
        return; // No playlists yet.
    }
    if let Err(e) = Playlists::open(db).and_then(|mut p| change(&mut p)) {
        eprintln!("updating playlists: {e}");
    }
}

fn migrate(db: &Connection) -> rusqlite::Result<()> {
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version == 0 {
        db.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS playlists (
                 id   INTEGER PRIMARY KEY,
                 name TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS playlist_items (
                 id          INTEGER PRIMARY KEY,
                 playlist_id INTEGER NOT NULL REFERENCES playlists(id),
                 position    INTEGER NOT NULL,
                 file_name   TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS playlist_items_by_list ON playlist_items (playlist_id, position);
             CREATE INDEX IF NOT EXISTS playlist_items_by_file ON playlist_items (file_name);
             CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             PRAGMA user_version = {SCHEMA_VERSION};"
        ))?;
    }
    Ok(())
}

fn sql(e: rusqlite::Error) -> String {
    format!("playlists: {e}")
}

fn clean_name(name: &str) -> Result<String, String> {
    let name = one_line(name.trim());
    if name.is_empty() { Err("A playlist needs a name.".into()) } else { Ok(name) }
}

fn one_line(s: &str) -> String {
    s.chars().map(|c| if c.is_control() { ' ' } else { c }).collect()
}

fn check_file_name(name: &str) -> Result<(), String> {
    let plain = Path::new(name).file_name().is_some_and(|n| n == name);
    if plain && name.to_ascii_lowercase().ends_with(".mp3") { Ok(()) } else { Err(format!("not a recording name: {name}")) }
}

fn stem(file_name: &str) -> String {
    Path::new(file_name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

/// One request from the UI (`ss_playlists`), as JSON with an `op` field.
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Request {
    List,
    Items { id: i64 },
    Create { name: String, #[serde(default)] file_names: Vec<String> },
    Rename { id: i64, name: String },
    Duplicate { id: i64 },
    Delete { id: i64 },
    Add { id: i64, file_names: Vec<String> },
    Remove { id: i64, item_ids: Vec<i64> },
    SetOrder { id: i64, item_ids: Vec<i64> },
    Active,
    SetActive { id: Option<i64> },
    ExportM3u8 { id: i64, path: String },
}

impl Playlists {
    /// Runs a UI request; the answer is JSON.
    pub fn handle(&mut self, request: Request) -> Result<serde_json::Value, String> {
        use serde_json::{Value, json, to_value};
        let v = |r: Result<Value, serde_json::Error>| r.map_err(|e| e.to_string());
        match request {
            Request::List => v(to_value(self.list()?)),
            Request::Items { id } => v(to_value(self.items(id)?)),
            Request::Create { name, file_names } => v(to_value(self.create(&name, &file_names)?)),
            Request::Rename { id, name } => v(to_value(self.rename(id, &name)?)),
            Request::Duplicate { id } => v(to_value(self.duplicate(id)?)),
            Request::Delete { id } => self.delete(id).map(|()| Value::Null),
            Request::Add { id, file_names } => v(to_value(self.add(id, &file_names)?)),
            Request::Remove { id, item_ids } => self.remove(id, &item_ids).map(|()| Value::Null),
            Request::SetOrder { id, item_ids } => self.set_order(id, &item_ids).map(|()| Value::Null),
            Request::Active => Ok(json!(self.active()?)),
            Request::SetActive { id } => self.set_active(id).map(|()| Value::Null),
            Request::ExportM3u8 { id, path } => {
                let dir = crate::settings::load().recordings_dir();
                Ok(json!({ "missing": self.export_m3u8(id, &dir, Path::new(&path))? }))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::tempdir;

    fn open() -> (PathBuf, Playlists) {
        let dir = tempdir();
        let p = Playlists::open(&dir.join("playlists.db")).unwrap();
        (dir, p)
    }

    fn names(items: &[Item]) -> Vec<&str> {
        items.iter().map(|i| i.file_name.as_str()).collect()
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn create_list_rename_duplicate_delete() {
        let (_dir, mut p) = open();
        let road = p.create("Road Trip", &s(&["a.mp3", "b.mp3"])).unwrap();
        assert_eq!((road.name.as_str(), road.count), ("Road Trip", 2));
        let again = p.create(" road trip ", &[]).unwrap();
        assert_eq!(again.name, "road trip (2)", "names are unique, ignoring case");
        p.create("Chill", &[]).unwrap();
        let listed: Vec<_> = p.list().unwrap().into_iter().map(|p| p.name).collect();
        assert_eq!(listed, ["Chill", "Road Trip", "road trip (2)"]);

        assert_eq!(p.rename(again.id, "Road Trip").unwrap().name, "Road Trip (2)");
        assert_eq!(p.rename(road.id, "road TRIP").unwrap().name, "road TRIP", "its own name doesn't collide");
        assert!(p.rename(road.id, "  ").is_err());

        let copy = p.duplicate(road.id).unwrap();
        assert_eq!((copy.name.as_str(), copy.count), ("road TRIP copy", 2));
        assert_eq!(names(&p.items(copy.id).unwrap()), ["a.mp3", "b.mp3"]);

        p.delete(road.id).unwrap();
        assert!(p.items(road.id).unwrap().is_empty());
        assert_eq!(p.list().unwrap().len(), 3);
    }

    #[test]
    fn add_remove_and_reorder() {
        let (_dir, mut p) = open();
        let id = p.create("Mix", &s(&["a.mp3"])).unwrap().id;
        let added = p.add(id, &s(&["b.mp3", "a.mp3", "c.mp3"])).unwrap();
        assert_eq!(names(&added), ["b.mp3", "a.mp3", "c.mp3"], "duplicates are allowed");
        let items = p.items(id).unwrap();
        assert_eq!(names(&items), ["a.mp3", "b.mp3", "a.mp3", "c.mp3"]);

        p.remove(id, &[items[0].id]).unwrap();
        assert_eq!(names(&p.items(id).unwrap()), ["b.mp3", "a.mp3", "c.mp3"]);

        let ids: Vec<i64> = p.items(id).unwrap().iter().map(|i| i.id).collect();
        p.set_order(id, &[ids[2], ids[0], ids[1]]).unwrap();
        assert_eq!(names(&p.items(id).unwrap()), ["c.mp3", "b.mp3", "a.mp3"]);
        assert!(p.set_order(id, &[ids[0], ids[1]]).is_err(), "must name every item");
        assert!(p.add(id, &s(&["../x.mp3"])).is_err());
        assert!(p.add(id, &s(&["x.mp3.part"])).is_err());
    }

    #[test]
    fn follows_renames_and_trash() {
        let (dir, mut p) = open();
        let one = p.create("One", &s(&["a.mp3", "b.mp3", "a.mp3"])).unwrap().id;
        let two = p.create("Two", &s(&["b.mp3", "a.mp3"])).unwrap().id;
        let db = dir.join("playlists.db");
        follow(&db, |p| p.file_renamed("a.mp3", "A.mp3"));
        assert_eq!(names(&p.items(one).unwrap()), ["A.mp3", "b.mp3", "A.mp3"]);
        follow(&db, |p| p.file_removed("A.mp3"));
        assert_eq!(names(&p.items(one).unwrap()), ["b.mp3"]);
        assert_eq!(names(&p.items(two).unwrap()), ["b.mp3"]);
        let added = p.add(one, &s(&["c.mp3"])).unwrap();
        assert_eq!(names(&p.items(one).unwrap()), ["b.mp3", "c.mp3"], "positions stay dense: {added:?}");
    }

    #[test]
    fn active_playlist_is_remembered_until_deleted() {
        let (_dir, mut p) = open();
        assert_eq!(p.active().unwrap(), None);
        let id = p.create("Mix", &[]).unwrap().id;
        p.set_active(Some(id)).unwrap();
        assert_eq!(p.active().unwrap(), Some(id));
        p.delete(id).unwrap();
        assert_eq!(p.active().unwrap(), None);
        p.set_active(None).unwrap();
        assert!(p.set_active(Some(999)).is_err());
    }

    #[test]
    fn requests_are_json() {
        let (_dir, mut p) = open();
        let req: Request = serde_json::from_str(r#"{"op":"create","name":"Mix","fileNames":["a.mp3"]}"#).unwrap();
        let made = p.handle(req).unwrap();
        assert_eq!(made["name"], "Mix");
        let id = made["id"].as_i64().unwrap();
        let req: Request = serde_json::from_str(&format!(r#"{{"op":"items","id":{id}}}"#)).unwrap();
        assert_eq!(p.handle(req).unwrap()[0]["fileName"], "a.mp3");
        let req: Request = serde_json::from_str(r#"{"op":"setActive","id":null}"#).unwrap();
        assert!(p.handle(req).unwrap().is_null());
    }

    #[test]
    fn exports_m3u8() {
        use crate::mp3::tests::{encode_all, sine};
        let (dir, mut p) = open();
        let recordings = dir.join("Sound Scraper");
        std::fs::create_dir_all(&recordings).unwrap();
        std::fs::write(recordings.join("a.mp3"), encode_all(&sine(1.0, 44100), 44100, true)).unwrap();
        let id = p.create("Mix", &s(&["a.mp3", "gone.mp3"])).unwrap().id;
        let out = dir.join("Mix.m3u8");
        assert_eq!(p.export_m3u8(id, &recordings, &out).unwrap(), 1);
        let text = std::fs::read_to_string(&out).unwrap();
        assert!(text.starts_with("#EXTM3U\n#PLAYLIST:Mix\n#EXTINF:1,a\n"), "{text}");
        assert!(text.contains(&format!("Sound Scraper{}a.mp3", std::path::MAIN_SEPARATOR)), "{text}");
        assert!(!text.contains("gone"));
    }
}
