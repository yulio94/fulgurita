use serde::{Deserialize, Serialize};

/// Every document Sietch writes is a `.md` file whose type lives in its
/// frontmatter. Chapters are the only type this version creates.
pub const TYPE_CHAPTER: &str = "chapter";

/// Used when neither the file nor its project says otherwise.
pub const DEFAULT_LANGUAGE: &str = "en";

/// The metadata block at the top of a document.
///
/// Only these five fields are modelled. A file may carry more — written by hand
/// or by a later version of Sietch — and nothing here has to know about them,
/// because no write path rebuilds the block. `replace_body` and `set_title_in`
/// copy it byte for byte and edit in place, so unknown fields, comments, key
/// order and quoting style all survive a save untouched.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Frontmatter {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "type")]
    pub doc_type: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Deserializing into this succeeds for any YAML mapping and fails for anything
/// else, which is how a leading `---` is told apart from a horizontal rule.
#[derive(Deserialize)]
struct AnyMapping {}

/// Splits a raw file into its frontmatter block and its body. The block is
/// returned unparsed and without its delimiters.
///
/// A block is only recognised when the file opens with a `---` line, a later
/// line is exactly `---` or `...`, and what lies between them is a YAML
/// mapping. That last condition is what keeps a document opening on a
/// horizontal rule from losing its first paragraph to the parser. Anything that
/// fails a condition is all body, so nothing is ever dropped.
pub fn split(raw: &str) -> (Option<&str>, &str) {
    let Some(after_open) = raw
        .strip_prefix("---\n")
        .or_else(|| raw.strip_prefix("---\r\n"))
    else {
        return (None, raw);
    };

    let mut offset = 0;
    for line in after_open.split_inclusive('\n') {
        if matches!(line.trim_end_matches(['\n', '\r']), "---" | "...") {
            let block = &after_open[..offset];
            if serde_saphyr::from_str::<AnyMapping>(block).is_err() {
                return (None, raw);
            }
            let body = &after_open[offset + line.len()..];
            return (Some(block), body.trim_start_matches(['\n', '\r']));
        }
        offset += line.len();
    }

    // Opened and never closed
    (None, raw)
}

/// Reads a file's frontmatter, filling in anything missing. Never fails: a file
/// with no block, a malformed one, or one holding none of the known fields all
/// open on defaults. This is permanent behaviour, not migration code — a
/// project is a folder of `.md` files and other editors get to write them.
pub fn parse_or_default<'a>(raw: &'a str, id: &str, language: &str) -> (Frontmatter, &'a str) {
    let (block, body) = split(raw);
    let mut fm = block
        .and_then(|block| serde_saphyr::from_str::<Frontmatter>(block).ok())
        .unwrap_or_default();

    if fm.id.is_empty() {
        fm.id = id.to_string();
    }
    if fm.doc_type.is_empty() {
        fm.doc_type = TYPE_CHAPTER.to_string();
    }
    if fm.language.is_empty() {
        fm.language = language.to_string();
    }
    if fm.title.is_empty() {
        fm.title = derive_title(body, id);
    }
    (fm, body)
}

// ponytail: a file Sietch wrote always carries a title, so this only fires for
// one whose block was stripped elsewhere. Chapter files are named by UUID, so
// the stem would read as noise in the sidebar — a leading `# ` heading wins
// when the body has one. Falls back to the stem, which is a real name for a
// file someone dropped in by hand.
fn derive_title(body: &str, stem: &str) -> String {
    body.lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(str::trim)
        .filter(|heading| !heading.is_empty())
        .unwrap_or(stem)
        .to_string()
}

/// Renders a whole file from scratch. Only used when there is no block to keep.
pub fn render(fm: &Frontmatter, body: &str) -> Result<String, String> {
    let block =
        serde_saphyr::to_string(fm).map_err(|e| format!("Failed to serialize frontmatter: {e}"))?;
    Ok(format!("---\n{block}---\n\n{body}"))
}

/// Swaps a file's body, keeping its block byte for byte. Writes a fresh block
/// from `fm` when the file has none — the block lands on the first save, not on
/// the read that noticed it was missing.
pub fn replace_body(raw: &str, fm: &Frontmatter, body: &str) -> Result<String, String> {
    match split(raw).0 {
        Some(block) => Ok(format!("---\n{}---\n\n{body}", fill_missing_in(block, fm)?)),
        None => render(fm, body),
    }
}

/// Appends the known entries a block is missing, and only those. Existing
/// entries keep their value, their order and the comments around them.
///
/// A project written before this ticket has a block holding nothing but
/// `title`. Reading one works on defaults forever, but the file itself would
/// stay half-formed unless a save completes it, so this is where a project
/// catches up — one file at a time, as it is edited.
fn fill_missing_in(block: &str, fm: &Frontmatter) -> Result<String, String> {
    let present: Vec<&str> = block
        .lines()
        .filter_map(|line| line.split_once(':'))
        .filter(|(key, _)| !key.starts_with([' ', '\t', '#', '-']))
        .map(|(key, _)| key)
        .collect();

    let mut out = block.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }

    for (key, value) in [
        ("id", fm.id.as_str()),
        ("type", fm.doc_type.as_str()),
        ("language", fm.language.as_str()),
        ("title", fm.title.as_str()),
    ] {
        if !present.contains(&key) {
            out.push_str(&format!("{key}: {}\n", scalar(value)?));
        }
    }
    // Tags are only ever missing when there are none — they were parsed out of
    // this same block, so an absent key means an empty list
    if !present.contains(&"tags") {
        out.push_str("tags: []\n");
    }
    Ok(out)
}

/// Replaces the `title` entry inside a block, leaving every other byte alone.
/// Prepends the entry when the block has no title.
pub fn set_title_in(block: &str, title: &str) -> Result<String, String> {
    let entry = format!("title: {}", scalar(title)?);

    let mut out = String::with_capacity(block.len() + entry.len());
    let mut lines = block.split_inclusive('\n').peekable();
    let mut replaced = false;

    while let Some(line) = lines.next() {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if !replaced && is_title_entry(trimmed) {
            out.push_str(&entry);
            out.push('\n');
            replaced = true;
            // ponytail: only a block scalar (`|`, `>`) or an empty value spills
            // onto the following indented lines, and those have to go with it.
            // A plain scalar never does, so nothing else is touched.
            if spills_onto_next_lines(trimmed) {
                while lines
                    .peek()
                    .is_some_and(|next| next.starts_with([' ', '\t']))
                {
                    lines.next();
                }
            }
            continue;
        }
        out.push_str(line);
    }

    if !replaced {
        out.insert_str(0, &entry);
        out.insert(entry.len(), '\n');
    }
    Ok(out)
}

/// True for the line that opens a top-level `title` entry. YAML wants a space
/// after the colon, so `title:foo` is not one and neither is `titles:`.
fn is_title_entry(line: &str) -> bool {
    line.strip_prefix("title:")
        .is_some_and(|rest| rest.is_empty() || rest.starts_with([' ', '\t']))
}

fn spills_onto_next_lines(line: &str) -> bool {
    let value = line["title:".len()..].trim();
    value.is_empty() || value.starts_with(['|', '>'])
}

/// Emits a string as YAML, so a title holding `:` or a leading `#` is quoted
/// instead of corrupting the block.
fn scalar(value: &str) -> Result<String, String> {
    serde_saphyr::to_string(&value)
        .map(|yaml| yaml.trim_end_matches(['\n', '\r']).to_string())
        .map_err(|e| format!("Failed to serialize frontmatter value: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fill_missing_in_adds_only_what_is_absent() {
        let fm = Frontmatter {
            id: "abc".into(),
            doc_type: "chapter".into(),
            language: "es".into(),
            title: "Old".into(),
            tags: Vec::new(),
        };
        // The shape every project written before this ticket has on disk
        let out = fill_missing_in("title: Old\n", &fm).expect("fill_missing_in");
        assert_eq!(
            out,
            "title: Old\nid: abc\ntype: chapter\nlanguage: es\ntags: []\n"
        );

        // A complete block is left exactly as it is, comments and order included
        let complete =
            "# mine\nid: abc\ntype: chapter\nlanguage: es\ntitle: Old\ntags:\n  - dune\n";
        assert_eq!(
            fill_missing_in(complete, &fm).expect("fill_missing_in"),
            complete
        );
    }

    #[test]
    fn set_title_in_touches_nothing_but_the_title() {
        let block = "id: abc\npov: Paul\ntitle: Old\n# a comment\ntags:\n  - dune\n";
        let out = set_title_in(block, "New").expect("set_title_in");
        assert_eq!(
            out,
            "id: abc\npov: Paul\ntitle: New\n# a comment\ntags:\n  - dune\n"
        );
    }

    #[test]
    fn set_title_in_replaces_a_block_scalar_whole() {
        // The indented continuation belongs to the old value and has to go with it
        let block = "title: |\n  Line one\n  Line two\npov: Paul\n";
        let out = set_title_in(block, "New").expect("set_title_in");
        assert_eq!(out, "title: New\npov: Paul\n");
    }

    #[test]
    fn set_title_in_prepends_when_the_block_has_no_title() {
        let out = set_title_in("pov: Paul\n", "New").expect("set_title_in");
        assert_eq!(out, "title: New\npov: Paul\n");
    }

    #[test]
    fn a_key_that_merely_starts_with_title_is_left_alone() {
        let block = "titles: many\n  title: nested\ntitle: Real\n";
        let out = set_title_in(block, "New").expect("set_title_in");
        assert_eq!(out, "titles: many\n  title: nested\ntitle: New\n");
    }
}
