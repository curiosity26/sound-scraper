//! What a skin may contain on disk, and safe extraction of `.sskin` archives.

use std::{
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
};

/// Largest `.sskin` archive accepted.
pub const MAX_ARCHIVE_BYTES: u64 = 25 * 1024 * 1024;
/// Most files (and folders) in a skin.
pub const MAX_FILES: usize = 500;
/// Largest total size of a skin's files once unpacked.
pub const MAX_UNPACKED_BYTES: u64 = 100 * 1024 * 1024;
/// Largest image width or height, in pixels.
pub const MAX_IMAGE_SIDE: u32 = 4096;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const OTHER_EXTENSIONS: &[&str] = &["json", "txt", "md"];

pub fn is_image(path: &str) -> bool {
    extension(path).is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.as_str()))
}

fn extension(path: &str) -> Option<String> {
    Path::new(path).extension().map(|e| e.to_string_lossy().to_ascii_lowercase())
}

/// Files a skin may contain: images, JSON and text (plus extension-less
/// LICENSE/README/AUTHORS notes).
fn allowed_file(path: &str) -> bool {
    match extension(path) {
        Some(ext) => IMAGE_EXTENSIONS.contains(&ext.as_str()) || OTHER_EXTENSIONS.contains(&ext.as_str()),
        None => {
            let name = Path::new(path).file_name().map(|n| n.to_string_lossy().to_ascii_uppercase());
            matches!(name.as_deref(), Some("LICENSE" | "README" | "AUTHORS" | "COPYING"))
        }
    }
}

/// Junk that archivers and Finder add; skipped instead of rejected.
fn is_junk(path: &str) -> bool {
    path.split('/').any(|part| part == "__MACOSX" || part == ".DS_Store" || part == "Thumbs.db")
}

/// Checks a relative path from a manifest or an archive: no absolute paths,
/// drive letters, backslashes or `..`. Returns it with `./` parts removed.
pub fn safe_relative(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("empty path".into());
    }
    if path.contains('\\') || path.contains(':') || path.contains('\0') {
        return Err(format!("{path}: only relative paths with forward slashes are allowed"));
    }
    let mut clean = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir => return Err(format!("{path}: \"..\" is not allowed in skin paths")),
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!("{path}: absolute paths are not allowed in skins"));
            }
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(format!("{path}: not a file path"));
    }
    Ok(clean)
}

/// A file in an unpacked skin folder.
pub struct SkinFile {
    /// Relative, with forward slashes.
    pub rel: String,
    pub path: PathBuf,
    pub len: u64,
    pub modified: Option<std::time::SystemTime>,
}

/// Checks an unpacked skin folder: no symlinks, only allowed file types,
/// and within the file count and size limits. Dot files and folders (e.g.
/// `.git` in an author's working folder) are ignored.
pub fn check_folder(root: &Path) -> Result<(), String> {
    skin_files(root).map(|_| ())
}

/// The files of an unpacked skin folder, checked as by `check_folder`,
/// sorted by path.
pub fn skin_files(root: &Path) -> Result<Vec<SkinFile>, String> {
    let mut files = Vec::new();
    let mut count = 0usize;
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("{}: {e}", dir.display()))?;
            let path = entry.path();
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if entry.file_name().to_string_lossy().starts_with('.') || is_junk(&rel) {
                continue;
            }
            let meta = fs::symlink_metadata(&path).map_err(|e| format!("{rel}: {e}"))?;
            if meta.file_type().is_symlink() {
                return Err(format!("{rel}: symbolic links are not allowed in skins"));
            }
            count += 1;
            if count > MAX_FILES {
                return Err(format!("the skin has more than {MAX_FILES} files"));
            }
            if meta.is_dir() {
                stack.push(path);
            } else if !meta.is_file() {
                return Err(format!("{rel}: not a regular file"));
            } else if !allowed_file(&rel) {
                return Err(format!("{rel}: only images (PNG, JPEG, WebP), JSON and text files are allowed"));
            } else {
                total += meta.len();
                if total > MAX_UNPACKED_BYTES {
                    return Err(format!("the skin is larger than {} MB unpacked", MAX_UNPACKED_BYTES / 1024 / 1024));
                }
                files.push(SkinFile { rel, path, len: meta.len(), modified: meta.modified().ok() });
            }
        }
    }
    files.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(files)
}

/// Zips a skin folder's files (as listed by `skin_files`) into `out`, at
/// the archive's root. Images are stored as they are; text is deflated.
pub fn write_archive(root: &Path, out: &Path) -> Result<(), String> {
    use std::io::Write;
    let files = skin_files(root)?;
    let temp = out.with_extension("sskin-partial");
    let result = (|| {
        let file = fs::File::create(&temp).map_err(|e| format!("{}: {e}", temp.display()))?;
        let mut zip = zip::ZipWriter::new(file);
        for f in &files {
            let method = if is_image(&f.rel) { zip::CompressionMethod::Stored } else { zip::CompressionMethod::Deflated };
            let options = zip::write::SimpleFileOptions::default().compression_method(method);
            zip.start_file(f.rel.as_str(), options).map_err(|e| format!("{}: {e}", f.rel))?;
            let bytes = fs::read(&f.path).map_err(|e| format!("{}: {e}", f.rel))?;
            zip.write_all(&bytes).map_err(|e| format!("{}: {e}", f.rel))?;
        }
        zip.finish().map_err(|e| format!("{}: {e}", temp.display()))?;
        fs::rename(&temp, out).map_err(|e| format!("{}: {e}", out.display()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// Extracts a `.sskin` (zip) into `dest`, which must be empty, enforcing the
/// limits as it goes (sizes are counted from the actual data, not trusted
/// from the zip headers). Returns the skin's root: `dest`, or the single
/// top-level folder holding `skin.json` when the archive wraps one.
pub fn extract_archive(archive: &Path, dest: &Path) -> Result<PathBuf, String> {
    let name = archive.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let file = fs::File::open(archive).map_err(|e| format!("{name}: {e}"))?;
    let size = file.metadata().map_err(|e| format!("{name}: {e}"))?.len();
    if size > MAX_ARCHIVE_BYTES {
        return Err(format!("{name}: skins can be at most {} MB", MAX_ARCHIVE_BYTES / 1024 / 1024));
    }
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("{name}: not a valid skin archive ({e})"))?;
    if zip.len() > MAX_FILES {
        return Err(format!("{name}: the skin has more than {MAX_FILES} files"));
    }
    let mut total = 0u64;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|e| format!("{name}: {e}"))?;
        let entry_name = entry.name().to_string();
        if is_junk(&entry_name) {
            continue;
        }
        if entry.is_symlink() {
            return Err(format!("{entry_name}: symbolic links are not allowed in skins"));
        }
        let rel = safe_relative(entry_name.trim_end_matches('/'))?;
        let target = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| format!("{entry_name}: {e}"))?;
            continue;
        }
        if !allowed_file(&entry_name) {
            return Err(format!("{entry_name}: only images (PNG, JPEG, WebP), JSON and text files are allowed"));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{entry_name}: {e}"))?;
        }
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|e| format!("{entry_name}: {e}"))?;
        let remaining = MAX_UNPACKED_BYTES - total;
        let copied = io::copy(&mut (&mut entry).take(remaining + 1), &mut out).map_err(|e| format!("{entry_name}: {e}"))?;
        total += copied;
        if total > MAX_UNPACKED_BYTES {
            return Err(format!("{name}: the skin is larger than {} MB unpacked", MAX_UNPACKED_BYTES / 1024 / 1024));
        }
    }
    if dest.join("skin.json").is_file() {
        return Ok(dest.to_path_buf());
    }
    let dirs: Vec<PathBuf> = fs::read_dir(dest)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')))
        .collect();
    match dirs.as_slice() {
        [only] if only.join("skin.json").is_file() => Ok(only.clone()),
        _ => Err(format!("{name}: skin.json is missing")),
    }
}
