//! Recording names and locations (docs/design.md §3, §5).

use std::path::{Path, PathBuf};

/// Default recordings folder: `~/Music/Sound Scraper`.
pub fn recordings_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Music").join("Sound Scraper")
}

/// Replaces characters that are illegal in file names on macOS or Windows.
pub fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"/\:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.');
    if trimmed.is_empty() { "Recording".to_string() } else { trimmed.to_string() }
}

/// `<Source> YYYY-MM-DD HH-MM`, e.g. `Spotify 2026-10-03 14-05`.
pub fn default_name(source_label: &str, when: chrono::DateTime<chrono::Local>) -> String {
    sanitize(&format!("{source_label} {}", when.format("%Y-%m-%d %H-%M")))
}

/// `dir/<stem><ext>`, or `dir/<stem> (2)<ext>`, `(3)`… when taken. Each
/// suffix in `also_taken` (e.g. `.mp3.part`) must be free too.
pub fn unique_path(dir: &Path, stem: &str, ext: &str, also_taken: &[&str]) -> PathBuf {
    let free = |candidate: &str| {
        !dir.join(format!("{candidate}{ext}")).exists()
            && also_taken.iter().all(|other| !dir.join(format!("{candidate}{other}")).exists())
    };
    if free(stem) {
        return dir.join(format!("{stem}{ext}"));
    }
    (2..)
        .map(|n| format!("{stem} ({n})"))
        .find(|candidate| free(candidate))
        .map(|candidate| dir.join(format!("{candidate}{ext}")))
        .unwrap()
}

#[cfg(test)]
pub(crate) use tests::tempdir;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_illegal_characters() {
        assert_eq!(sanitize("AC/DC: Live?"), "AC_DC_ Live_");
        assert_eq!(sanitize("  ...  "), "Recording");
    }

    #[test]
    fn unique_path_adds_a_counter() {
        let dir = tempdir();
        std::fs::write(dir.join("Song.mp3"), b"").unwrap();
        std::fs::write(dir.join("Song (2).mp3.part"), b"").unwrap();
        assert_eq!(unique_path(&dir, "Song", ".mp3", &[".mp3.part"]), dir.join("Song (3).mp3"));
        assert_eq!(unique_path(&dir, "Other", ".mp3", &[]), dir.join("Other.mp3"));
    }

    pub(crate) fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sound-scraper-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
}
