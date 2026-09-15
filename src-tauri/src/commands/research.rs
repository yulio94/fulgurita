use crate::models::frontmatter::{self, Frontmatter, TYPE_LINK};
use crate::models::project::ProjectMeta;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
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

/// Where the New link form puts what it saves, so links do not sit among files.
const LINKS_DIR: &str = "Links";

/// What the hover card can draw as a thumbnail. PDF is left out: the three
/// platforms' webviews do not render it the same way.
const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// A thumbnail is read whole into memory and sent over IPC, so a huge scan is
/// refused and the card shows its name instead.
const PREVIEW_LIMIT: u64 = 10 * 1024 * 1024;

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

/// Saves a link as `research/Links/{title}.md`. The URL and title go in the
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
    let dir = project_dir.join(RESEARCH_DIR).join(LINKS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the links folder: {e}"))?;

    let fm = Frontmatter {
        id: Uuid::new_v4().to_string(),
        doc_type: TYPE_LINK.to_string(),
        language: meta.language,
        title: title.trim().to_string(),
        url: url.trim().to_string(),
        ..Frontmatter::default()
    };
    let raw = frontmatter::render(&fm, &notes)?;

    let (mut file, name) = claim_free(&dir, &file_stem_for(&fm.title), "md", new_file)?;
    file.write_all(raw.as_bytes())
        .map_err(|e| format!("Failed to write {name}: {e}"))?;
    Ok(ResearchNode::Item {
        id: format!("{ID_PREFIX}{LINKS_DIR}/{name}"),
        kind: KIND_LINK,
        title: fm.title,
        url: fm.url,
    })
}

/// Creates `stem.ext` in `dir`, or `stem 2.ext`, `stem 3.ext` and so on when the
/// name is taken, and says which name it got. `ext` is empty for a folder.
///
/// `create` has to fail with `AlreadyExists` rather than reuse what is there, so
/// a file that appears between two tries is skipped, never overwritten.
fn claim_free<T>(
    dir: &Path,
    stem: &str,
    ext: &str,
    create: impl Fn(&Path) -> io::Result<T>,
) -> Result<(T, String), String> {
    for n in 1.. {
        let numbered = if n == 1 {
            stem.to_string()
        } else {
            format!("{stem} {n}")
        };
        let name = if ext.is_empty() {
            numbered
        } else {
            format!("{numbered}.{ext}")
        };
        match create(&dir.join(&name)) {
            Ok(created) => return Ok((created, name)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Failed to create {name}: {e}")),
        }
    }
    unreachable!("the name loop only ends by returning")
}

fn new_file(path: &Path) -> io::Result<fs::File> {
    OpenOptions::new().write(true).create_new(true).open(path)
}

/// Copies files and folders the writer picked or dropped into `research/`, or
/// into the research folder `folder_id` names. Copies, never moves: the original
/// stays where it was. A name already taken gets a number. Stops at the first
/// failure and names it, leaving whatever was copied before it in place.
#[tauri::command]
pub fn import_research(
    project_path: String,
    folder_id: Option<String>,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let project_dir = PathBuf::from(&project_path);
    let (dest, prefix) = match folder_id {
        Some(id) => (research_path(&project_dir, &id)?, format!("{id}/")),
        None => (project_dir.join(RESEARCH_DIR), ID_PREFIX.to_string()),
    };
    fs::create_dir_all(&dest).map_err(|e| format!("Failed to create the research folder: {e}"))?;

    paths
        .iter()
        .map(|source| copy_into(Path::new(source), &dest).map(|name| format!("{prefix}{name}")))
        .collect()
}

/// Copies one file or folder into `dest` under a free name, and returns it.
///
/// `symlink_metadata` so a link is never followed as a folder: a link back up
/// the tree would copy forever. A link to a file still copies its contents.
fn copy_into(source: &Path, dest: &Path) -> Result<String, String> {
    let shown = source.display();
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Cannot import {shown}: its name is not valid UTF-8"))?;
    let is_dir = fs::symlink_metadata(source)
        .map_err(|e| format!("Failed to read {shown}: {e}"))?
        .is_dir();

    if is_dir {
        // Dropping a research folder onto itself or a folder inside it would
        // copy its own copy, forever
        let canonical = |path: &Path| {
            path.canonicalize()
                .map_err(|e| format!("Failed to read {}: {e}", path.display()))
        };
        if canonical(dest)?.starts_with(canonical(source)?) {
            return Err(format!("Cannot copy {name} into itself."));
        }

        let ((), claimed) = claim_free(dest, name, "", |path| fs::create_dir(path))?;
        let target = dest.join(&claimed);
        let entries = fs::read_dir(source).map_err(|e| format!("Failed to read {shown}: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read {shown}: {e}"))?;
            copy_into(&entry.path(), &target)?;
        }
        return Ok(claimed);
    }

    let parts = Path::new(name);
    let stem = parts.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
    let ext = parts.extension().and_then(|e| e.to_str()).unwrap_or("");
    let (mut file, claimed) = claim_free(dest, stem, ext, new_file)?;
    let mut original =
        fs::File::open(source).map_err(|e| format!("Failed to read {shown}: {e}"))?;
    io::copy(&mut original, &mut file).map_err(|e| format!("Failed to copy {shown}: {e}"))?;
    Ok(claimed)
}

/// The bytes of a research image, for the hover card's thumbnail. Raw bytes over
/// IPC rather than a data URL: no base64 on either side, and no asset protocol
/// with a path scope to configure.
#[tauri::command]
pub fn read_research_image(
    project_path: String,
    id: String,
) -> Result<tauri::ipc::Response, String> {
    let path = research_path(Path::new(&project_path), &id)?;
    image_bytes(&path, &id).map(tauri::ipc::Response::new)
}

fn image_bytes(path: &Path, id: &str) -> Result<Vec<u8>, String> {
    let is_image = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(ext))
        });
    if !is_image {
        return Err(format!("Not an image: {id}"));
    }
    let size = fs::metadata(path)
        .map_err(|e| format!("Failed to read {id}: {e}"))?
        .len();
    if size > PREVIEW_LIMIT {
        return Err(format!("Too large to preview: {id}"));
    }
    fs::read(path).map_err(|e| format!("Failed to read {id}: {e}"))
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
            ["Links", "Places", "Worldbuilding", "zebra.pdf"]
        );

        let ResearchNode::Folder {
            children: links, ..
        } = &nodes[0]
        else {
            panic!("folders first: {nodes:?}");
        };
        assert!(matches!(
            &links[0],
            ResearchNode::Item { kind: KIND_LINK, url, .. } if url == "https://a.test"
        ));
        let ResearchNode::Folder { children, .. } = &nodes[1] else {
            panic!("folders first: {nodes:?}");
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
        assert_eq!(first_id, "research/Links/Q&A whowhat.md");
        assert_eq!(second_id, "research/Links/Q&A whowhat 2.md");

        let raw = fs::read_to_string(
            dir.join(RESEARCH_DIR)
                .join(LINKS_DIR)
                .join("Q&A whowhat.md"),
        )
        .expect("read");
        assert!(raw.contains("type: link"), "{raw}");
        assert!(raw.contains("url: https://b.test"), "{raw}");
        assert!(!raw.contains("pov"), "{raw}");
        assert_eq!(
            read_research(path, first_id).expect("read_research"),
            "Said it twice."
        );
    }

    #[test]
    fn importing_copies_files_and_folders_and_never_overwrites() {
        let (tmp, dir, path) = project();
        let outside = tmp.path().join("outside");
        fs::create_dir_all(outside.join("Interviews").join("March")).expect("mkdir");
        fs::write(
            outside.join("Interviews").join("March").join("call.txt"),
            "Hi",
        )
        .expect("txt");
        fs::write(outside.join("scan.pdf"), [1u8, 2, 3]).expect("pdf");
        let sources = vec![
            outside.join("scan.pdf").to_string_lossy().into_owned(),
            outside.join("Interviews").to_string_lossy().into_owned(),
        ];

        let first = import_research(path.clone(), None, sources.clone()).expect("import");
        assert_eq!(first, ["research/scan.pdf", "research/Interviews"]);
        let again = import_research(path.clone(), None, sources).expect("import again");
        assert_eq!(again, ["research/scan 2.pdf", "research/Interviews 2"]);

        let research = dir.join(RESEARCH_DIR);
        assert_eq!(
            fs::read_to_string(research.join("Interviews 2").join("March").join("call.txt"))
                .expect("copied"),
            "Hi"
        );
        // Copied, not moved
        assert!(outside.join("scan.pdf").exists());

        let into = import_research(
            path,
            Some("research/Interviews".into()),
            vec![outside.join("scan.pdf").to_string_lossy().into_owned()],
        )
        .expect("into a folder");
        assert_eq!(into, ["research/Interviews/scan.pdf"]);
    }

    #[test]
    fn a_folder_cannot_be_imported_into_itself() {
        let (_tmp, dir, path) = project();
        let places = dir.join(RESEARCH_DIR).join("Places");
        fs::create_dir_all(places.join("Harbour")).expect("mkdir");

        let err = import_research(
            path,
            Some("research/Places/Harbour".into()),
            vec![places.to_string_lossy().into_owned()],
        )
        .expect_err("into itself");
        assert!(err.contains("into itself"), "{err}");
    }

    #[test]
    fn only_an_image_has_a_preview() {
        let (_tmp, dir, _path) = project();
        let research = dir.join(RESEARCH_DIR);
        fs::write(research.join("map.PNG"), [137u8, 80]).expect("png");
        fs::write(research.join("scan.pdf"), [1u8]).expect("pdf");

        assert_eq!(
            image_bytes(&research.join("map.PNG"), "research/map.PNG").expect("image"),
            [137u8, 80]
        );
        assert!(image_bytes(&research.join("scan.pdf"), "research/scan.pdf").is_err());
    }

    #[test]
    fn a_blank_title_still_names_the_file() {
        assert_eq!(file_stem_for(" ..?* "), "Link");
    }
}
