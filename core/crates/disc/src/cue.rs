//! Cue sheets for `.bin` audio images (the format ImgBurn, CDBurnerXP,
//! cdrdao, Brasero and VLC read).

use crate::{Layout, TrackInfo, msf};

/// The cue sheet for a single `.bin` named `bin_name` holding the program:
/// tracks with their gaps as INDEX 00 (the silence is in the file), and
/// CD-Text titles and performers when `cd_text`.
pub fn cue_sheet(
    bin_name: &str,
    title: &str,
    performer: Option<&str>,
    tracks: &[TrackInfo],
    layout: &Layout,
    cd_text: bool,
) -> String {
    let mut s = String::new();
    s.push_str("REM COMMENT \"Sound Scraper\"\n");
    if cd_text {
        if let Some(p) = performer {
            s.push_str(&format!("PERFORMER {}\n", quoted(p)));
        }
        s.push_str(&format!("TITLE {}\n", quoted(title)));
    }
    s.push_str(&format!("FILE {} BINARY\n", quoted(bin_name)));
    for (t, info) in layout.tracks.iter().zip(tracks) {
        s.push_str(&format!("  TRACK {:02} AUDIO\n", t.number));
        if cd_text {
            s.push_str(&format!("    TITLE {}\n", quoted(&info.title)));
            if let Some(p) = &info.performer {
                s.push_str(&format!("    PERFORMER {}\n", quoted(p)));
            }
        }
        if t.gap > 0 {
            s.push_str(&format!("    INDEX 00 {}\n", msf(t.gap_start)));
        }
        s.push_str(&format!("    INDEX 01 {}\n", msf(t.start)));
    }
    s
}

/// A cue string: double quotes can't be escaped, so they become single;
/// line breaks become spaces. CD-Text allows 80 characters.
fn quoted(text: &str) -> String {
    let clean: String = text
        .chars()
        .map(|c| match c {
            '"' => '\'',
            c if c.is_control() => ' ',
            c => c,
        })
        .take(80)
        .collect();
    format!("\"{clean}\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout;

    #[test]
    fn writes_tracks_gaps_and_cd_text() {
        let tracks = vec![
            TrackInfo {
                title: "So What".into(),
                performer: Some("Miles Davis".into()),
                frames: 44_100 * 10,
            },
            TrackInfo {
                title: "Say \"hi\"".into(),
                performer: None,
                frames: 44_100 * 10,
            },
        ];
        let l = layout(&tracks, 2).unwrap();
        let cue = cue_sheet("Mix.bin", "Mix", Some("Various"), &tracks, &l, true);
        assert_eq!(
            cue,
            "REM COMMENT \"Sound Scraper\"\nPERFORMER \"Various\"\nTITLE \"Mix\"\nFILE \"Mix.bin\" BINARY\n  TRACK 01 AUDIO\n    TITLE \"So What\"\n    PERFORMER \"Miles Davis\"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE \"Say 'hi'\"\n    INDEX 00 00:10:00\n    INDEX 01 00:12:00\n"
        );
        let plain = cue_sheet("Mix.bin", "Mix", None, &tracks, &l, false);
        assert!(!plain.contains("TITLE"));
    }
}
