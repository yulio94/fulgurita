use crate::models::frontmatter::{self, Frontmatter, TYPE_LINK};
use crate::models::project::ProjectMeta;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

/// The folder at the project root. On-record material only: ADR 0002 keeps
/// protected and sealed files out of the tree, so nothing in here has a tier.
pub(crate) const RESEARCH_DIR: &str = "research";

/// Every research id starts with this. Chapter ids are UUIDs and never hold a
/// `/`, so the two can share the sidebar's collapsed set and `activeDoc`.
const ID_PREFIX: &str = "research/";

const KIND_MARKDOWN: &str = "markdown";
const KIND_LINK: &str = "link";
const KIND_FILE: &str = "file";

/// Files the OS drops into folders on its own. Dotfiles are skipped separately.
const IGNORED: [&str; 2] = ["Thumbs.db", "desktop.ini"];

/// One entry under `research/`, shaped like `Node` so the frontend can hand the
/// folders straight to the sidebar's tree.
///
/// The id is the path below the project root, joined with `/` on every platform.
/// It is the only handle the frontend has on a file, and `research_path` is the
/// only way back from it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ResearchNode {
    Folder {
        id: String,
        title: String,
        children: Vec<ResearchNode>,
    },
    Item {
        id: String,
        /// `markdown` and `link` open in the editor, `file` in the OS default app.
        kind: &'static str,
        title: String,
        /// Empty for anything that is not a link.
        url: String,
    },
}

/// Turns an id from the frontend back into a path, refusing anything that would
/// leave `research/`. Every component has to be a plain name, which rules out
/// `..`, a root, and a Windows drive prefix in one check.
fn research_path(project_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let rel = Path::new(id.strip_prefix(ID_PREFIX).unwrap_or_default());
    let plain = rel.components().next().is_some()
        && rel.components().all(|c| matches!(c, Component::Normal(_)));
    if !plain {
        return Err(format!("Not a file in the research folder: {id}"));
    }
    Ok(project_dir.join(RESEARCH_DIR).join(rel))
}

/// Everything under `research/`, folders first. Reads the folder rather than
/// any list in `fulgurita.json`: the writer fills it from Finder or Explorer, so
/// the folder is the only record of what is in it.
#[tauri::command]
pub fn list_research(project_path: String) -> Result<Vec<ResearchNode>, String> {
    walk(&PathBuf::from(project_path).join(RESEARCH_DIR), ID_PREFIX)
}

fn walk(dir: &Path, prefix: &str) -> Result<Vec<ResearchNode>, String> {
    // Absent is empty, the way the trash treats its folder. open_project
    // creates it, but a folder can go away under a running app.
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(Vec::new());
    };

    let mut nodes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read the research folder: {e}"))?;
        // A name that is not UTF-8 cannot round-trip through an id
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') || IGNORED.contains(&name.as_str()) {
            continue;
        }

        let id = format!("{prefix}{name}");
        // file_type does not follow symlinks, so a link to a folder lists as a
        // file and a link back up the tree cannot loop the walk
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read {id}: {e}"))?;
        if file_type.is_dir() {
            nodes.push(ResearchNode::Folder {
                children: walk(&entry.path(), &format!("{id}/"))?,
                id,
                title: name,
            });
        } else {
            nodes.push(item(&entry.path(), id, name));
        }
    }

    nodes.sort_by_cached_key(|node| match node {
        ResearchNode::Folder { title, .. } => (false, title.to_lowercase()),
        ResearchNode::Item { title, .. } => (true, title.to_lowercase()),
    });
    Ok(nodes)
}

fn item(path: &Path, id: String, name: String) -> ResearchNode {
    let is_markdown = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
    // A `.md` that is not UTF-8 is still a file the OS can open
    let raw = is_markdown.then(|| fs::read_to_string(path).ok()).flatten();
    let Some(raw) = raw else {
        return ResearchNode::Item {
            id,
            kind: KIND_FILE,
            title: name,
            url: String::new(),
        };
    };

    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(&name);
    let (fm, _) = frontmatter::parse_or_default(&raw, stem, "");
    ResearchNode::Item {
        id,
        kind: if fm.doc_type == TYPE_LINK {
            KIND_LINK
        } else {
            KIND_MARKDOWN
        },
        title: fm.title,
        url: fm.url,
    }
}

/// The markdown body of a research document, without its frontmatter. A broken
/// block reads as body, the way `parse_or_default` reads it for chapters.
#[tauri::command]
pub fn read_research(project_path: String, id: String) -> Result<String, String> {
    let path = research_path(Path::new(&project_path), &id)?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read {id}: {e}"))?;
    let body = frontmatter::split(&raw).map_or(raw.as_str(), |(_, body)| body);
    Ok(body.to_string())
}

/// Saves a link as `research/{title}.md`. The URL and title go in the
/// frontmatter and the notes are the body, so the file reads fine in any editor.
#[tauri::command]
pub fn create_research_link(
    project_path: String,
    title: String,
    url: String,
    notes: String,
) -> Result<ResearchNode, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;
    let dir = project_dir.join(RESEARCH_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the research folder: {e}"))?;

    let fm = Frontmatter {
        id: Uuid::new_v4().to_string(),
        doc_type: TYPE_LINK.to_string(),
        language: meta.language,
        title: title.trim().to_string(),
        url: url.trim().to_string(),
        ..Frontmatter::default()
    };
    let raw = frontmatter::render(&fm, &notes)?;

    // create_new rather than an exists() check first, so a file that appears
    // in between is skipped instead of overwritten
    let stem = file_stem_for(&fm.title);
    for n in 1.. {
        let name = if n == 1 {
            format!("{stem}.md")
        } else {
            format!("{stem} {n}.md")
        };
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(&name))
        {
            Ok(mut file) => {
                file.write_all(raw.as_bytes())
                    .map_err(|e| format!("Failed to write {name}: {e}"))?;
                return Ok(ResearchNode::Item {
                    id: format!("{ID_PREFIX}{name}"),
                    kind: KIND_LINK,
                    title: fm.title,
                    url: fm.url,
                });
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Failed to create {name}: {e}")),
        }
    }
    unreachable!("the name loop only ends by returning")
}

/// A file name every platform accepts, from a title the writer typed. Drops the
/// characters Windows reserves and the leading dot that would hide the file
/// from `list_research`, and trims the trailing dots and spaces Windows strips.
// ponytail: a title that is a Windows device name (`CON`, `NUL`) still fails to
// write there, with the error shown in the dialog. Suffix those if anyone hits it.
fn file_stem_for(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .filter(|c| !c.is_control() && !r#"/\:*?"<>|"#.contains(*c))
        .take(100)
        .collect();
    let cleaned = cleaned.trim_matches(['.', ' ']);
    if cleaned.is_empty() {
        "Link".to_string()
    } else {
        cleaned.to_string()
    }
}

/// Opens a research file in whatever the OS uses for its type. Done from Rust so
/// the opener needs no path scope in the capability file, which could not name
/// a project folder chosen at runtime anyway.
#[tauri::command]
pub fn open_research_file(app: AppHandle, project_path: String, id: String) -> Result<(), String> {
    let path = research_path(Path::new(&project_path), &id)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Failed to open {id}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::project::create_project;

    fn project() -> (tempfile::TempDir, PathBuf, String) {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project(
            "novel".into(),
            tmp.path().to_string_lossy().into_owned(),
            None,
        )
        .expect("create_project");
        let dir = tmp.path().join("novel");
        let path = dir.to_string_lossy().into_owned();
        (tmp, dir, path)
    }

    fn titles(nodes: &[ResearchNode]) -> Vec<&str> {
        nodes
            .iter()
            .map(|node| match node {
                ResearchNode::Folder { title, .. } | ResearchNode::Item { title, .. } => {
                    title.as_str()
                }
            })
            .collect()
    }

    #[test]
    fn an_id_cannot_leave_the_research_folder() {
        let dir = Path::new("/p");
        assert!(research_path(dir, "research/../chapters/a.md").is_err());
        assert!(research_path(dir, "research/a/../../x").is_err());
        assert!(research_path(dir, "research//etc/passwd").is_err());
        assert!(research_path(dir, "research/").is_err());
        assert!(research_path(dir, "chapters/a.md").is_err());
        assert_eq!(
            research_path(dir, "research/Interviews/one.pdf").expect("plain id"),
            Path::new("/p/research/Interviews/one.pdf")
        );
    }

    #[test]
    fn a_new_project_has_a_research_folder() {
        let (_tmp, dir, _path) = project();
        assert!(dir.join(RESEARCH_DIR).is_dir());
    }

    #[test]
    fn listing_nests_folders_first_and_reads_what_each_file_is() {
        let (_tmp, dir, path) = project();
        let research = dir.join(RESEARCH_DIR);
        fs::create_dir_all(research.join("Places")).expect("mkdir");
        fs::write(research.join("Places").join("harbour.png"), [0u8]).expect("png");
        fs::write(research.join("zebra.pdf"), [0u8]).expect("pdf");
        fs::write(research.join("notes.md"), "# Worldbuilding\n\nSalt.").expect("md");
        fs::write(research.join(".DS_Store"), [0u8]).expect("dotfile");
        create_research_link(
            path.clone(),
            "Atlas".into(),
            "https://a.test".into(),
            "".into(),
        )
        .expect("link");

        let nodes = list_research(path).expect("list_research");
        assert_eq!(
            titles(&nodes),
            ["Places", "Atlas", "Worldbuilding", "zebra.pdf"]
        );

        let ResearchNode::Folder { children, .. } = &nodes[0] else {
            panic!("folder first: {nodes:?}");
        };
        assert_eq!(
            children[0],
            ResearchNode::Item {
                id: "research/Places/harbour.png".into(),
                kind: KIND_FILE,
                title: "harbour.png".into(),
                url: String::new(),
            }
        );
        assert!(matches!(
            &nodes[1],
            ResearchNode::Item { kind: KIND_LINK, url, .. } if url == "https://a.test"
        ));
        assert!(matches!(
            &nodes[2],
            ResearchNode::Item {
                kind: KIND_MARKDOWN,
                ..
            }
        ));
    }

    #[test]
    fn a_link_gets_a_safe_file_name_and_never_overwrites_one() {
        let (_tmp, dir, path) = project();
        let make = || {
            create_research_link(
                path.clone(),
                "  .Q&A: who/what?  ".into(),
                "https://b.test".into(),
                "Said it twice.".into(),
            )
            .expect("create_research_link")
        };

        let first = make();
        let second = make();
        let ResearchNode::Item { id: first_id, .. } = first else {
            unreachable!()
        };
        let ResearchNode::Item { id: second_id, .. } = second else {
            unreachable!()
        };
        assert_eq!(first_id, "research/Q&A whowhat.md");
        assert_eq!(second_id, "research/Q&A whowhat 2.md");

        let raw = fs::read_to_string(dir.join(RESEARCH_DIR).join("Q&A whowhat.md")).expect("read");
        assert!(raw.contains("type: link"), "{raw}");
        assert!(raw.contains("url: https://b.test"), "{raw}");
        assert!(!raw.contains("pov"), "{raw}");
        assert_eq!(
            read_research(path, first_id).expect("read_research"),
            "Said it twice."
        );
    }

    #[test]
    fn a_blank_title_still_names_the_file() {
        assert_eq!(file_stem_for(" ..?* "), "Link");
    }
}
