//! ID3 tag reading and editing (docs/design.md §6).
//!
//! Tags are written as ID3v2.4 by default (ID3v2.3 on request, for older
//! players) with no ID3v1 tag. Every write goes to a temporary copy next to
//! the file, which then atomically replaces the original, so a crash never
//! leaves a half-written recording.

use std::{
    io::Write,
    path::{Path, PathBuf},
};

use id3::{
    Tag, TagLike, Timestamp, Version,
    frame::{Comment, Picture, PictureType},
};

/// The editable fields of one recording. `None` means "not set".
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TagFields {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    /// "YYYY", "YYYY-MM" or "YYYY-MM-DD" (time of day is kept but not edited).
    pub date: Option<String>,
    pub track: Option<u32>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub has_cover: bool,
}

/// A change to apply to one or more files. Fields left `None` are kept as
/// they are; `Some(None)` clears a field; `Some(Some(v))` sets it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TagEdit {
    pub title: Option<Option<String>>,
    pub artist: Option<Option<String>>,
    pub album: Option<Option<String>>,
    pub album_artist: Option<Option<String>>,
    pub date: Option<Option<String>>,
    pub track: Option<Option<u32>>,
    pub genre: Option<Option<String>>,
    pub comment: Option<Option<String>>,
    pub cover: CoverEdit,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum CoverEdit {
    #[default]
    Keep,
    Remove,
    /// Embed this image (JPEG or PNG) as the front cover.
    Set(PathBuf),
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum TagVersion {
    #[default]
    V24,
    V23,
}

pub fn read(path: &Path) -> Result<TagFields, String> {
    let tag = match Tag::read_from_path(path) {
        Ok(tag) => tag,
        Err(e) if matches!(e.kind, id3::ErrorKind::NoTag) => return Ok(TagFields::default()),
        Err(e) => return Err(format!("reading tags from {}: {e}", path.display())),
    };
    Ok(TagFields {
        title: non_empty(tag.title()),
        artist: non_empty(tag.artist()),
        album: non_empty(tag.album()),
        album_artist: non_empty(tag.album_artist()),
        date: date_string(&tag),
        track: tag.track(),
        genre: non_empty(tag.genre_parsed().as_deref()),
        comment: tag.comments().find(|c| c.description.is_empty()).map(|c| c.text.clone()).filter(|t| !t.is_empty()),
        has_cover: front_cover(&tag).is_some(),
    })
}

/// The embedded front cover (or first picture): (MIME type, image bytes).
pub fn read_cover(path: &Path) -> Option<(String, Vec<u8>)> {
    let tag = Tag::read_from_path(path).ok()?;
    front_cover(&tag).map(|p| (p.mime_type.clone(), p.data.clone()))
}

/// Applies `edit` to the file at `path`, atomically.
pub fn write(path: &Path, edit: &TagEdit, version: TagVersion) -> Result<(), String> {
    // Load the cover first so a bad image fails before anything is touched.
    let new_cover = match &edit.cover {
        CoverEdit::Set(image) => Some(load_image(image)?),
        _ => None,
    };
    let mut tag = match Tag::read_from_path(path) {
        Ok(tag) => tag,
        Err(e) if matches!(e.kind, id3::ErrorKind::NoTag) => Tag::new(),
        Err(e) => return Err(format!("reading tags from {}: {e}", path.display())),
    };

    apply_text(&mut tag, &edit.title, Tag::set_title, Tag::remove_title);
    apply_text(&mut tag, &edit.artist, Tag::set_artist, Tag::remove_artist);
    apply_text(&mut tag, &edit.album, Tag::set_album, Tag::remove_album);
    apply_text(&mut tag, &edit.album_artist, Tag::set_album_artist, Tag::remove_album_artist);
    apply_text(&mut tag, &edit.genre, Tag::set_genre, Tag::remove_genre);
    if let Some(track) = edit.track {
        match track {
            Some(n) if n > 0 => tag.set_track(n),
            _ => tag.remove_track(),
        }
    }
    if let Some(comment) = &edit.comment {
        tag.remove_comment(None, None);
        if let Some(text) = comment.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            tag.add_frame(Comment { lang: "eng".into(), description: String::new(), text: text.to_string() });
        }
    }
    if let Some(date) = &edit.date {
        remove_dates(&mut tag);
        if let Some(text) = date.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            tag.set_date_recorded(parse_date(text)?);
        }
    }
    match (&edit.cover, new_cover) {
        (CoverEdit::Set(_), Some((mime_type, data))) => {
            tag.remove_all_pictures();
            tag.add_frame(Picture {
                mime_type,
                picture_type: PictureType::CoverFront,
                description: String::new(),
                data,
            });
        }
        (CoverEdit::Remove, _) => tag.remove_all_pictures(),
        _ => {}
    }

    let version = match version {
        TagVersion::V24 => Version::Id3v24,
        TagVersion::V23 => {
            downgrade_dates_for_v23(&mut tag);
            Version::Id3v23
        }
    };
    write_atomically(path, &tag, version)
}

/// Copies the file, writes the tag into the copy, then renames it over the
/// original. On any error the original is untouched and the copy removed.
fn write_atomically(path: &Path, tag: &Tag, version: Version) -> Result<(), String> {
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let temp = path.with_file_name(format!(".{file_name}.tagging"));
    let result = (|| -> Result<(), String> {
        std::fs::copy(path, &temp).map_err(|e| format!("copying {}: {e}", path.display()))?;
        tag.write_to_path(&temp, version).map_err(|e| format!("writing tags: {e}"))?;
        std::fs::File::options()
            .append(true)
            .open(&temp)
            .and_then(|mut f| f.flush().and_then(|()| f.sync_all()))
            .map_err(|e| format!("syncing {}: {e}", temp.display()))?;
        std::fs::rename(&temp, path).map_err(|e| format!("replacing {}: {e}", path.display()))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result
}

fn apply_text(
    tag: &mut Tag,
    edit: &Option<Option<String>>,
    set: fn(&mut Tag, String),
    remove: fn(&mut Tag),
) {
    if let Some(value) = edit {
        match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            Some(v) => set(tag, v.to_string()),
            None => remove(tag),
        }
    }
}

fn non_empty(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

fn front_cover(tag: &Tag) -> Option<&Picture> {
    tag.pictures().find(|p| p.picture_type == PictureType::CoverFront).or_else(|| tag.pictures().next())
}

/// Recording date as "YYYY[-MM[-DD]]", from TDRC (v2.4) or TYER (v2.3).
fn date_string(tag: &Tag) -> Option<String> {
    if let Some(ts) = tag.date_recorded() {
        let mut s = format!("{:04}", ts.year);
        if let Some(m) = ts.month {
            s += &format!("-{m:02}");
            if let Some(d) = ts.day {
                s += &format!("-{d:02}");
            }
        }
        return Some(s);
    }
    tag.year().map(|y| format!("{y:04}"))
}

fn parse_date(text: &str) -> Result<Timestamp, String> {
    let err = || format!("dates look like 2026, 2026-10 or 2026-10-03 (got \"{text}\")");
    let parts: Vec<&str> = text.split('-').collect();
    if parts.is_empty() || parts.len() > 3 || parts[0].len() != 4 {
        return Err(err());
    }
    let num = |s: &str, max: u8| s.parse::<u8>().ok().filter(|n| (1..=max).contains(n));
    let year: i32 = parts[0].parse().map_err(|_| err())?;
    let month = match parts.get(1) {
        Some(m) => Some(num(m, 12).ok_or_else(err)?),
        None => None,
    };
    let day = match parts.get(2) {
        Some(d) => Some(num(d, 31).ok_or_else(err)?),
        None => None,
    };
    Ok(Timestamp { year, month, day, hour: None, minute: None, second: None })
}

fn remove_dates(tag: &mut Tag) {
    tag.remove_date_recorded();
    tag.remove_year();
    tag.remove("TDAT");
    tag.remove("TIME");
}

/// ID3v2.3 has no TDRC; store the year in TYER (and day/month in TDAT).
fn downgrade_dates_for_v23(tag: &mut Tag) {
    if let Some(ts) = tag.date_recorded() {
        tag.remove_date_recorded();
        tag.set_year(ts.year);
        if let (Some(m), Some(d)) = (ts.month, ts.day) {
            tag.set_text("TDAT", format!("{d:02}{m:02}"));
        }
    }
}

fn load_image(path: &Path) -> Result<(String, Vec<u8>), String> {
    let data = std::fs::read(path).map_err(|e| format!("reading {}: {e}", path.display()))?;
    let mime = if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else {
        return Err(format!("{} isn't a JPEG or PNG image", path.display()));
    };
    if data.len() > 16 * 1024 * 1024 {
        return Err("cover images must be under 16 MB".into());
    }
    Ok((mime.to_string(), data))
}

/// File extension for a cover's MIME type.
pub fn cover_extension(mime: &str) -> &'static str {
    if mime.eq_ignore_ascii_case("image/png") { "png" } else { "jpg" }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::mp3::tests::{encode_all, sine};

    pub(crate) const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49,
        0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0, 0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D,
        0x1D, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    fn mp3(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, encode_all(&sine(0.3, 44100), 44100, true)).unwrap();
        path
    }

    fn set(v: &str) -> Option<Option<String>> {
        Some(Some(v.to_string()))
    }

    #[test]
    fn round_trips_every_field() {
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        let audio_before = crate::mp3::scan(&path).unwrap();
        let cover = dir.join("cover.png");
        std::fs::write(&cover, PNG_1X1).unwrap();

        let edit = TagEdit {
            title: set("Song"),
            artist: set("Artist"),
            album: set("Album"),
            album_artist: set("Various"),
            date: set("2026-10-03"),
            track: Some(Some(7)),
            genre: set("Jazz"),
            comment: set("Live take"),
            cover: CoverEdit::Set(cover),
        };
        write(&path, &edit, TagVersion::V24).unwrap();

        assert_eq!(read(&path).unwrap(), TagFields {
            title: Some("Song".into()),
            artist: Some("Artist".into()),
            album: Some("Album".into()),
            album_artist: Some("Various".into()),
            date: Some("2026-10-03".into()),
            track: Some(7),
            genre: Some("Jazz".into()),
            comment: Some("Live take".into()),
            has_cover: true,
        });
        assert_eq!(read_cover(&path).unwrap(), ("image/png".to_string(), PNG_1X1.to_vec()));
        assert_eq!(Tag::read_from_path(&path).unwrap().version(), Version::Id3v24);
        // The audio frames are untouched.
        let audio_after = crate::mp3::scan(&path).unwrap();
        assert_eq!((audio_after.frames, audio_after.has_info_tag), (audio_before.frames, audio_before.has_info_tag));
        assert!(std::fs::read_dir(&dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".tagging")));
    }

    #[test]
    fn untouched_fields_are_kept_and_cleared_fields_removed() {
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        write(&path, &TagEdit { title: set("T"), artist: set("A"), comment: set("C"), ..Default::default() }, TagVersion::V24)
            .unwrap();
        write(&path, &TagEdit { artist: Some(None), comment: set("   "), album: set("New"), ..Default::default() }, TagVersion::V24)
            .unwrap();
        let fields = read(&path).unwrap();
        assert_eq!(fields.title.as_deref(), Some("T"));
        assert_eq!(fields.artist, None);
        assert_eq!(fields.comment, None, "blank text clears");
        assert_eq!(fields.album.as_deref(), Some("New"));
    }

    #[test]
    fn saving_album_and_cover_keeps_every_other_frame() {
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        let base = TagEdit {
            title: set("Testeroonie"),
            artist: set("Testo"),
            comment: set("Recorded from Music"),
            date: set("2026-10-03"),
            ..Default::default()
        };
        write(&path, &base, TagVersion::V24).unwrap();
        let mut tag = Tag::read_from_path(&path).unwrap();
        tag.set_text("TSSE", "Sound Scraper test");
        tag.write_to_path(&path, Version::Id3v24).unwrap();

        let cover = dir.join("cover.png");
        std::fs::write(&cover, PNG_1X1).unwrap();
        write(&path, &TagEdit { album: set("Roonie"), cover: CoverEdit::Set(cover), ..Default::default() }, TagVersion::V24)
            .unwrap();

        let fields = read(&path).unwrap();
        assert_eq!(fields.title.as_deref(), Some("Testeroonie"));
        assert_eq!(fields.artist.as_deref(), Some("Testo"));
        assert_eq!(fields.comment.as_deref(), Some("Recorded from Music"));
        assert_eq!(fields.date.as_deref(), Some("2026-10-03"));
        assert_eq!(fields.album.as_deref(), Some("Roonie"));
        assert!(fields.has_cover);
        assert_eq!(Tag::read_from_path(&path).unwrap().get("TSSE").and_then(|f| f.content().text()), Some("Sound Scraper test"));
    }

    #[test]
    fn writes_id3v23_with_a_year() {
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        write(&path, &TagEdit { date: set("1999-05-17"), title: set("Old player"), ..Default::default() }, TagVersion::V23)
            .unwrap();
        let tag = Tag::read_from_path(&path).unwrap();
        assert_eq!(tag.version(), Version::Id3v23);
        assert_eq!(tag.year(), Some(1999));
        assert!(tag.get("TDRC").is_none());
        assert_eq!(read(&path).unwrap().date.as_deref(), Some("1999"));
    }

    #[test]
    fn id3v23_uses_encodings_windows_can_read() {
        // Windows' MP3 property handler (Explorer, Media Player) can't read
        // ID3v2.4's UTF-8 frames; v2.3 must use Latin-1 or UTF-16.
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        let cover = dir.join("c.png");
        std::fs::write(&cover, PNG_1X1).unwrap();
        let edit = TagEdit { title: set("Café ☕"), artist: set("Plain"), cover: CoverEdit::Set(cover), ..Default::default() };
        write(&path, &edit, TagVersion::V23).unwrap();
        let data = std::fs::read(&path).unwrap();
        for id in [&b"TIT2"[..], b"TPE1", b"APIC"] {
            let i = data.windows(4).position(|w| w == id).unwrap();
            assert!(data[i + 10] <= 1, "{} uses text encoding {}", String::from_utf8_lossy(id), data[i + 10]);
        }
        assert_eq!(read(&path).unwrap().title.as_deref(), Some("Café ☕"));
    }

    #[test]
    fn removes_cover_and_rejects_bad_input_without_touching_the_file() {
        let dir = crate::paths::tempdir();
        let path = mp3(&dir, "a.mp3");
        let cover = dir.join("cover.png");
        std::fs::write(&cover, PNG_1X1).unwrap();
        write(&path, &TagEdit { cover: CoverEdit::Set(cover), ..Default::default() }, TagVersion::V24).unwrap();
        write(&path, &TagEdit { cover: CoverEdit::Remove, ..Default::default() }, TagVersion::V24).unwrap();
        assert!(!read(&path).unwrap().has_cover);

        let before = std::fs::read(&path).unwrap();
        let not_image = dir.join("notes.txt");
        std::fs::write(&not_image, b"hello").unwrap();
        let err = write(&path, &TagEdit { title: set("X"), cover: CoverEdit::Set(not_image), ..Default::default() }, TagVersion::V24);
        assert!(err.unwrap_err().contains("isn't a JPEG or PNG"));
        assert!(write(&path, &TagEdit { date: set("10/03/2026"), ..Default::default() }, TagVersion::V24).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before, "failed edits leave the file unchanged");
    }

    #[test]
    fn reads_untagged_files() {
        let dir = crate::paths::tempdir();
        let path = dir.join("raw.mp3");
        std::fs::write(&path, encode_all(&sine(0.2, 44100), 44100, true)).unwrap();
        assert_eq!(read(&path).unwrap(), TagFields::default());
    }
}

