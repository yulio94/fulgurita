use crate::commands::chapter::chapter_meta;
use crate::models::frontmatter;
use crate::models::project::{ChapterMeta, ProjectMeta};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

/// The directories a document can live in. `trash/` is deliberately not one:
/// what is deleted is not part of the manuscript, and `list_trash` is its view.
///
/// `notes/` holds nothing yet. It is walked anyway because `open_project`
/// creates it, and a writer or a sync can put a `.md` there without asking us.
const DOC_DIRS: [&str; 2] = ["chapters", "notes"];

/// What a view is asking for. Every field is optional, so an empty filter is
/// every document in the project.
///
/// The frontend builds this; nothing here knows what a Códex or a POV group is.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DocFilter {
    #[serde(rename = "type")]
    pub doc_type: Option<String>,
    pub tag: Option<String>,
    /// `Some("")` selects the documents with no POV assigned, which is a group
    /// F-075 draws. That is why this is an `Option<String>` and not a `String`:
    /// absent and empty have to mean different things.
    pub pov: Option<String>,
    /// `title` or `modified`. Anything else keeps the order the walk found.
    pub order_by: Option<String>,
}

/// Every `.md` under `DOC_DIRS`, parsed and filtered.
///
/// This walks the directories rather than `sietch.json`'s tree, which is the one
/// way it differs from `list_chapters` and the reason it exists: `notes/` has no
/// tree entries at all, and a file dropped into `chapters/` by hand or synced in
/// from another editor is a document whether or not we have heard of it. The
/// tolerant parser already reads those files; this is what lists them.
///
/// ponytail: reads the files on every call. F-071 asked for a SQLite index, and
/// `list_chapters` already parses every frontmatter on project open, so a table
/// would have bought a second copy to invalidate and nothing else. The cost is
/// one read per document per query. F-027 is where a table earns its keep, if
/// FTS5 wins there — swapping one in behind this signature changes no caller.
#[tauri::command]
pub fn query_docs(project_path: String, filter: DocFilter) -> Result<Vec<ChapterMeta>, String> {
    let project_dir = PathBuf::from(&project_path);
    let meta = ProjectMeta::load(&project_dir)?;

    let mut docs = Vec::new();
    for dir in DOC_DIRS {
        collect_dir(&project_dir.join(dir), &meta.language, &mut docs)?;
    }

    docs.retain(|doc| matches(doc, &filter));

    match filter.order_by.as_deref() {
        // Case-insensitively, or `Dune` and `dune` land at opposite ends of the
        // list. No locale collation: that is a bigger decision than this ticket,
        // and it would want the same answer the sidebar gives.
        //
        // The title itself breaks the tie. Without it two chapters whose titles
        // differ only in case fall back to whatever order `read_dir` returned,
        // which is the filesystem's business and differs between machines.
        Some("title") => docs.sort_by(|a, b| {
            (a.title.to_lowercase(), &a.title).cmp(&(b.title.to_lowercase(), &b.title))
        }),
        Some("modified") => docs.sort_by(|a, b| b.modified.cmp(&a.modified)),
        _ => {}
    }
    Ok(docs)
}

/// Reads every `.md` in one directory. A directory that is not there contributes
/// nothing and is not an error — `notes/` is empty in a project nobody has put
/// anything in, and it can be deleted from under a running app.
fn collect_dir(dir: &Path, language: &str, out: &mut Vec<ChapterMeta>) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };

    for entry in entries.flatten() {
        let path = entry.path();
        // macOS and Windows match a filename case-insensitively and Linux does
        // not, so `.MD` has to list the same on all three.
        if !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        // A file that cannot be read skips the listing rather than failing it,
        // the way an orphaned id skips `list_chapters`
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let (fm, body) = frontmatter::parse_or_default(&raw, id, language);
        out.push(chapter_meta(id, fm, body, &path)?);
    }
    Ok(())
}

fn matches(doc: &ChapterMeta, filter: &DocFilter) -> bool {
    filter.doc_type.as_ref().is_none_or(|t| &doc.doc_type == t)
        && filter.tag.as_ref().is_none_or(|t| doc.tags.contains(t))
        && filter.pov.as_ref().is_none_or(|p| &doc.pov == p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::{create_chapter, save_chapter};
    use crate::commands::project::create_project;

    /// A real project on disk, plus its path. The guard has to stay bound or
    /// the directory is swept out from under the test.
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

    /// Writes a document nothing in the app created, which is the case this
    /// command exists for.
    fn drop_in(dir: &Path, subdir: &str, name: &str, raw: &str) {
        let target = dir.join(subdir);
        fs::create_dir_all(&target).expect("create dir");
        fs::write(target.join(name), raw).expect("drop_in");
    }

    fn query(path: &str, filter: DocFilter) -> Vec<ChapterMeta> {
        query_docs(path.to_string(), filter).expect("query_docs")
    }

    /// Owned, so a caller can pass a query's result straight in without
    /// binding it first.
    fn titles(docs: Vec<ChapterMeta>) -> Vec<String> {
        docs.into_iter().map(|doc| doc.title).collect()
    }

    fn has(found: &[String], title: &str) -> bool {
        found.iter().any(|t| t == title)
    }

    #[test]
    fn a_chapter_with_no_tree_entry_still_lists() {
        let (_tmp, dir, path) = project();
        drop_in(
            &dir,
            "chapters",
            "dropped.md",
            "---\ntitle: Dropped In\ntype: chapter\n---\n\nThe spice.\n",
        );

        // This is the whole difference from list_chapters, which walks
        // sietch.json's tree and would never see this file
        let found = titles(query(&path, DocFilter::default()));
        assert!(has(&found, "Dropped In"), "{found:?}");
    }

    #[test]
    fn notes_are_documents_and_the_trash_is_not() {
        let (_tmp, dir, path) = project();
        drop_in(
            &dir,
            "notes",
            "paul.md",
            "---\ntitle: Paul\ntype: character\n---\n\nHe wakes.\n",
        );
        drop_in(
            &dir,
            "trash",
            "gone.md",
            "---\ntitle: Gone\ntype: chapter\n---\n\nDeleted.\n",
        );

        let found = titles(query(&path, DocFilter::default()));
        assert!(has(&found, "Paul"), "{found:?}");
        assert!(!has(&found, "Gone"), "{found:?}");
    }

    #[test]
    fn a_missing_notes_directory_returns_the_chapters_rather_than_an_error() {
        let (_tmp, dir, path) = project();
        create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        fs::remove_dir_all(dir.join("notes")).expect("remove notes/");

        assert_eq!(titles(query(&path, DocFilter::default())), ["Chapter One"]);
    }

    #[test]
    fn a_file_with_no_block_lists_on_its_derived_title() {
        let (_tmp, dir, path) = project();
        drop_in(&dir, "notes", "loose.md", "# From Obsidian\n\nBody.\n");

        let docs = query(&path, DocFilter::default());
        let doc = docs.iter().find(|d| d.id == "loose").expect("loose.md");
        assert_eq!(doc.title, "From Obsidian");
        // parse_or_default fills the type in, so it groups under chapters
        assert_eq!(doc.doc_type, "chapter");
    }

    #[test]
    fn a_broken_block_lists_rather_than_failing_the_query() {
        let (_tmp, dir, path) = project();
        create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        // The one file every write path refuses. Listing is not a write.
        drop_in(&dir, "chapters", "broken.md", "---\ntitle: [unbalanced\n---\n\nbody\n");

        let found = titles(query(&path, DocFilter::default()));
        assert_eq!(found.len(), 2, "{found:?}");
        assert!(has(&found, "broken"), "falls back to the stem: {found:?}");
    }

    #[test]
    fn a_file_that_is_not_markdown_is_not_a_document() {
        let (_tmp, dir, path) = project();
        drop_in(&dir, "notes", "cover.png", "not markdown");
        drop_in(&dir, "notes", "shouted.MD", "---\ntitle: Shouted\n---\n\nBody.\n");

        let found = titles(query(&path, DocFilter::default()));
        // Case-insensitively, or this file lists on macOS and Windows and not on Linux
        assert_eq!(found, ["Shouted"], "{found:?}");
    }

    #[test]
    fn type_tag_and_pov_each_narrow_the_result() {
        let (_tmp, dir, path) = project();
        drop_in(
            &dir,
            "chapters",
            "one.md",
            "---\ntitle: One\ntype: chapter\npov: paul\ntags: [arrakeen]\n---\n\nA.\n",
        );
        drop_in(
            &dir,
            "chapters",
            "two.md",
            "---\ntitle: Two\ntype: chapter\npov: jessica\ntags: [arrakeen, dune]\n---\n\nB.\n",
        );
        drop_in(
            &dir,
            "notes",
            "paul.md",
            "---\ntitle: Paul\ntype: character\n---\n\nC.\n",
        );

        let by_type = titles(query(
            &path,
            DocFilter {
                doc_type: Some("character".into()),
                ..Default::default()
            },
        ));
        assert_eq!(by_type, ["Paul"]);

        let by_tag = titles(query(
            &path,
            DocFilter {
                tag: Some("dune".into()),
                ..Default::default()
            },
        ));
        assert_eq!(by_tag, ["Two"]);

        let by_pov = titles(query(
            &path,
            DocFilter {
                pov: Some("paul".into()),
                ..Default::default()
            },
        ));
        assert_eq!(by_pov, ["One"]);
    }

    #[test]
    fn an_empty_pov_selects_the_documents_nobody_assigned_one() {
        let (_tmp, dir, path) = project();
        drop_in(
            &dir,
            "chapters",
            "one.md",
            "---\ntitle: One\ntype: chapter\npov: paul\n---\n\nA.\n",
        );
        drop_in(
            &dir,
            "chapters",
            "two.md",
            "---\ntitle: Two\ntype: chapter\n---\n\nB.\n",
        );

        // The "Sin POV asignado" group F-075 draws. Absent and empty have to
        // mean different things here, which is why the filter is an Option.
        let none = titles(query(
            &path,
            DocFilter {
                pov: Some(String::new()),
                ..Default::default()
            },
        ));
        assert_eq!(none, ["Two"]);
        assert_eq!(query(&path, DocFilter::default()).len(), 2);
    }

    #[test]
    fn ordering_by_title_puts_dune_beside_its_own_lowercase() {
        let (_tmp, dir, path) = project();
        for (name, title) in [("a.md", "dune"), ("b.md", "Arrakis"), ("c.md", "Dune")] {
            drop_in(
                &dir,
                "chapters",
                name,
                &format!("---\ntitle: {title}\ntype: chapter\n---\n\nBody.\n"),
            );
        }

        let sorted = titles(query(
            &path,
            DocFilter {
                order_by: Some("title".into()),
                ..Default::default()
            },
        ));
        // Byte order alone would sort every capital ahead of every lowercase
        // and split these two
        assert_eq!(sorted, ["Arrakis", "Dune", "dune"]);
    }

    #[test]
    fn a_pov_written_by_hand_survives_a_save_and_reaches_the_listing() {
        let (_tmp, _dir, path) = project();
        let created =
            create_chapter(path.clone(), "Chapter One".into(), None).expect("create_chapter");
        let file = PathBuf::from(&path)
            .join("chapters")
            .join(format!("{}.md", created.id));
        fs::write(
            &file,
            "---\ntitle: Chapter One\npov: paul\n---\n\nOld body.\n",
        )
        .expect("write");

        save_chapter(path.clone(), created.id.clone(), "New body.".into()).expect("save_chapter");

        let docs = query(&path, DocFilter::default());
        assert_eq!(docs[0].pov, "paul");
        assert!(fs::read_to_string(&file).expect("read").contains("pov: paul"));
    }

    #[test]
    fn the_filter_arrives_from_the_frontend_in_camel_case() {
        // The frontend sends `type` and `orderBy`; a rename here is a silent
        // break there, the same way ChapterMeta's field names are.
        let filter: DocFilter =
            serde_json::from_str(r#"{"type":"character","orderBy":"title","pov":""}"#)
                .expect("deserialize");
        assert_eq!(filter.doc_type.as_deref(), Some("character"));
        assert_eq!(filter.order_by.as_deref(), Some("title"));
        assert_eq!(filter.pov.as_deref(), Some(""));
        assert!(filter.tag.is_none());

        // An empty object is every document, not a rejected payload
        let empty: DocFilter = serde_json::from_str("{}").expect("deserialize");
        assert!(empty.doc_type.is_none() && empty.order_by.is_none());
    }
}
