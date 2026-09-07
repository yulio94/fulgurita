use serde::{Deserialize, Serialize};

/// Every document Sietch writes is a `.md` file whose type lives in its
/// frontmatter. Chapters are the only type this version creates.
pub const TYPE_CHAPTER: &str = "chapter";

/// Used when neither the file nor its project says otherwise.
pub const DEFAULT_LANGUAGE: &str = "en";

/// The metadata block at the top of a document.
///
/// Only these six fields are modelled. A file may carry more — written by hand
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
    /// What the chapter is about, in the writer's own words. The only modelled
    /// field a document is allowed to simply not have — skipped when empty so a
    /// chapter nobody has summarised carries no key at all.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub synopsis: String,
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
/// mapping. `Ok((None, raw))` is a file with no block at all: the whole file is
/// body and nothing was dropped.
///
/// `Err` is the case this returns a Result for — a file that opened a block and
/// then broke it. Reading one still has to work, so `parse_or_default` falls
/// back to all-body. Writing one must not: every write path rebuilds the block
/// from the top, so a save would leave the broken block sitting in the
/// manuscript as prose, and repairing the file afterwards does not bring it
/// back. The writers refuse instead.
///
/// Broken is told apart from merely-not-a-block by what the candidate is. Prose
/// under a horizontal rule opens with a sentence; a block opens with an entry.
/// Past that, a candidate that will not parse as YAML at all is broken, and one
/// that parses but is not a mapping is prose again.
pub fn split(raw: &str) -> Result<(Option<&str>, &str), String> {
    let Some(after_open) = raw
        .strip_prefix("---\n")
        .or_else(|| raw.strip_prefix("---\r\n"))
    else {
        return Ok((None, raw));
    };

    // A rule is followed by prose, and prose that happens to be invalid YAML is
    // still prose. Checked before anything is parsed so a document opening on a
    // scene break is never called broken.
    if !after_open.lines().next().is_some_and(opens_like_a_block) {
        return Ok((None, raw));
    }

    let mut offset = 0;
    for line in after_open.split_inclusive('\n') {
        if matches!(line.trim_end_matches(['\n', '\r']), "---" | "...") {
            let block = &after_open[..offset];

            // ponytail: `---\n---` is two rules with nothing between them, not a
            // block that failed to parse. Answered here rather than left to the
            // probe, whose reading of an empty document is a parser detail.
            if block.trim().is_empty() {
                return Ok((None, raw));
            }

            // `IgnoredAny` accepts every shape YAML can hold, so it fails only
            // when the block will not parse. The snippet renderer stacks source
            // lines and carets under its message, which is three lines of ASCII
            // in a tooltip, and `crop_radius: 0` turns it off.
            let terse = serde_saphyr::options! { crop_radius: 0 };
            if let Err(e) =
                serde_saphyr::from_str_with_options::<serde::de::IgnoredAny>(block, terse)
            {
                return Err(broken(&format!("the `---` block is not valid YAML ({e})")));
            }
            if serde_saphyr::from_str::<AnyMapping>(block).is_err() {
                return Ok((None, raw));
            }

            let body = &after_open[offset + line.len()..];
            return Ok((Some(block), body.trim_start_matches(['\n', '\r'])));
        }
        offset += line.len();
    }

    Err(broken("the `---` block opens but never closes"))
}

/// True for a line that could open a block: a top-level entry or a comment.
/// YAML wants a space after the colon, so `He said:nothing` is not one, and
/// neither is an indented line.
fn opens_like_a_block(line: &str) -> bool {
    line.starts_with('#')
        || line.split_once(':').is_some_and(|(key, value)| {
            !key.is_empty()
                && !key.starts_with([' ', '\t'])
                && (value.is_empty() || value.starts_with([' ', '\t']))
        })
}

/// The one sentence a writer gets when a file is too broken to write to. It has
/// to say what to do, because nothing in the app can do it for them.
fn broken(reason: &str) -> String {
    format!(
        "This chapter's frontmatter is broken: {reason}. Sietch will not write the \
         file — saving would bury the broken block in your manuscript as prose. Fix \
         it in a text editor, then reopen the chapter."
    )
}

/// Reads a file's frontmatter, filling in anything missing. Never fails: a file
/// with no block, a broken one, or one holding none of the known fields all
/// open on defaults. This is permanent behaviour, not migration code — a
/// project is a folder of `.md` files and other editors get to write them.
///
/// A broken block reads as body on purpose. The writer has to be able to open
/// the file and see what is wrong with it; only the write paths refuse.
pub fn parse_or_default<'a>(raw: &'a str, id: &str, language: &str) -> (Frontmatter, &'a str) {
    let (block, body) = split(raw).unwrap_or((None, raw));
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
///
/// Fails on a file whose block is broken, rather than writing a second block
/// over the top of it and leaving the first one in the manuscript. See `split`.
pub fn replace_body(raw: &str, fm: &Frontmatter, body: &str) -> Result<String, String> {
    match split(raw)?.0 {
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
    // Synopsis is deliberately absent from both lists. A chapter nobody has
    // summarised has nothing to catch up on, and writing `synopsis: ""` into
    // every file on its first save is noise in a format people read by hand.
    Ok(out)
}

/// Replaces the `title` entry inside a block, leaving every other byte alone.
/// Prepends the entry when the block has no title.
pub fn set_title_in(block: &str, title: &str) -> Result<String, String> {
    Ok(set_entry_in(block, "title", &scalar(title)?))
}

/// Replaces the `tags` entry inside a block, leaving every other byte alone.
/// Prepends the entry when the block has none.
pub fn set_tags_in(block: &str, tags: &[String]) -> String {
    set_entry_in(block, "tags", &flow_sequence(tags))
}

/// Replaces the `synopsis` entry inside a block, leaving every other byte alone.
/// Prepends the entry when the block has none.
///
/// A synopsis is prose and may run to paragraphs, which `scalar` already
/// handles: saphyr renders a multi-line string as a `|-` block scalar with its
/// continuation lines indented, so the entry stays one entry and still reads as
/// a summary in a plain text editor.
pub fn set_synopsis_in(block: &str, synopsis: &str) -> Result<String, String> {
    Ok(set_entry_in(block, "synopsis", &scalar(synopsis)?))
}

/// Replaces the `key` entry inside a block with an already-rendered `value`,
/// leaving every other byte alone. Prepends the entry when the block has none.
///
/// The value arrives rendered because how a YAML value is written is this
/// module's business and no caller's — `set_title_in` and `set_tags_in` are the
/// two that know.
fn set_entry_in(block: &str, key: &str, value: &str) -> String {
    let entry = format!("{key}: {value}");

    let mut out = String::with_capacity(block.len() + entry.len());
    let mut lines = block.split_inclusive('\n').peekable();
    let mut replaced = false;

    while let Some(line) = lines.next() {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if !replaced && opens_entry(trimmed, key) {
            out.push_str(&entry);
            out.push('\n');
            replaced = true;
            // ponytail: only a block scalar (`|`, `>`) or an empty value spills
            // onto the following lines, and those have to go with it. A plain
            // scalar never does, so nothing else is touched. The spill is
            // indented, except a sequence, which YAML lets sit flush at the
            // parent's column — `tags:` above `- dune` is one entry, not two.
            //
            // A blank line inside the value goes with it too. Leaving it would
            // end the spill early and strand the items below it under the new
            // entry as garbage; the cost is a decorative blank line inside a
            // value that is being replaced anyway.
            if spills_onto_next_lines(trimmed, key) {
                while lines.peek().is_some_and(|next| {
                    next.starts_with([' ', '\t', '-']) || next.trim().is_empty()
                }) {
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
    out
}

/// True for the line that opens a top-level `key` entry. YAML wants a space
/// after the colon, so `title:foo` is not one and neither is `titles:`.
fn opens_entry(line: &str, key: &str) -> bool {
    line.strip_prefix(key)
        .and_then(|rest| rest.strip_prefix(':'))
        .is_some_and(|rest| rest.is_empty() || rest.starts_with([' ', '\t']))
}

fn spills_onto_next_lines(line: &str, key: &str) -> bool {
    let value = line[key.len() + 1..].trim();
    value.is_empty() || value.starts_with(['|', '>'])
}

/// Emits tags as a one-line flow sequence, which is the shape `fill_missing_in`
/// already writes and the reason the entry can be rewritten a line at a time.
///
/// Items are quoted through `serde_json` rather than `scalar`, which renders a
/// scalar for block context: inside `[...]` a tag holding `,` or `]` would come
/// back split. YAML 1.2 is a superset of JSON, so a JSON string is a valid
/// always-quoted YAML scalar, and `Value`'s Display cannot fail the way
/// `to_string` can.
fn flow_sequence(tags: &[String]) -> String {
    let items: Vec<String> = tags
        .iter()
        .map(|tag| serde_json::Value::from(tag.as_str()).to_string())
        .collect();
    format!("[{}]", items.join(", "))
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
            synopsis: String::new(),
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

    #[test]
    fn set_tags_in_replaces_a_flow_sequence_and_touches_nothing_else() {
        let block = "id: abc\ntags: [dune, old]\npov: Paul\n";
        let out = set_tags_in(block, &["arrakeen".into()]);
        assert_eq!(out, "id: abc\ntags: [\"arrakeen\"]\npov: Paul\n");

        // An empty list is the shape fill_missing_in writes, minus the quotes
        assert_eq!(
            set_tags_in(block, &[]),
            "id: abc\ntags: []\npov: Paul\n",
            "clearing the tags"
        );
    }

    #[test]
    fn set_tags_in_replaces_a_block_sequence_indented_or_flush() {
        // YAML allows both, and the items belong to the entry either way
        let cases = [
            ("indented", "id: abc\ntags:\n  - dune\n  - old\npov: Paul\n"),
            ("flush", "id: abc\ntags:\n- dune\n- old\npov: Paul\n"),
        ];
        for (what, block) in cases {
            assert_eq!(
                set_tags_in(block, &["arrakeen".into()]),
                "id: abc\ntags: [\"arrakeen\"]\npov: Paul\n",
                "{what}"
            );
        }
    }

    #[test]
    fn set_tags_in_prepends_when_the_block_has_no_tags() {
        let out = set_tags_in("pov: Paul\n", &["dune".into(), "spice".into()]);
        assert_eq!(out, "tags: [\"dune\", \"spice\"]\npov: Paul\n");
    }

    #[test]
    fn a_blank_line_inside_a_tag_list_does_not_orphan_its_items() {
        // Hand-written and legal. Ending the spill at the blank line would leave
        // `  - old` sitting under the new entry as garbage.
        let block = "tags:\n  - dune\n\n  - old\npov: Paul\n";
        assert_eq!(
            set_tags_in(block, &["arrakeen".into()]),
            "tags: [\"arrakeen\"]\npov: Paul\n"
        );
    }

    #[test]
    fn a_tag_holding_a_comma_or_a_bracket_survives_a_round_trip() {
        // The reason the items are quoted: unquoted, the flow sequence would
        // read this back as three tags
        let tags = vec!["a, b".to_string(), "c]d".to_string()];
        let block = set_tags_in("id: abc\n", &tags);
        let fm: Frontmatter = serde_saphyr::from_str(&block).expect("parse");
        assert_eq!(fm.tags, tags);
    }

    #[test]
    fn a_multi_line_synopsis_is_written_as_an_indented_block_scalar() {
        let out =
            set_synopsis_in("title: One\n", "Paul wakes.\n\nJessica waits.").expect("set");
        assert_eq!(
            out,
            "synopsis: |-\n  Paul wakes.\n  \n  Jessica waits.\ntitle: One\n"
        );

        // And the block it produced parses back to exactly what went in
        let fm = serde_saphyr::from_str::<Frontmatter>(&out).expect("reparse");
        assert_eq!(fm.synopsis, "Paul wakes.\n\nJessica waits.");
        assert_eq!(fm.title, "One");
    }

    #[test]
    fn rewriting_a_synopsis_takes_the_old_block_scalar_with_it() {
        let block = "title: One\nsynopsis: |-\n  Old.\n  Two lines of it.\npov: Paul\n";
        let out = set_synopsis_in(block, "New.").expect("set_synopsis_in");
        assert_eq!(out, "title: One\nsynopsis: New.\npov: Paul\n");
    }

    #[test]
    fn an_empty_synopsis_is_written_rather_than_dropped() {
        // Clearing the field has to reach the file, so the key stays with an
        // empty value. Only a chapter that never had one carries no key.
        let out = set_synopsis_in("synopsis: Old.\n", "").expect("set_synopsis_in");
        assert_eq!(out, "synopsis: \"\"\n");
        assert_eq!(
            serde_saphyr::from_str::<Frontmatter>(&out)
                .expect("reparse")
                .synopsis,
            ""
        );
    }

    #[test]
    fn render_leaves_out_a_synopsis_nobody_wrote() {
        let fm = Frontmatter {
            id: "abc".into(),
            doc_type: "chapter".into(),
            language: "en".into(),
            title: "One".into(),
            tags: Vec::new(),
            synopsis: String::new(),
        };
        let raw = render(&fm, "").expect("render");
        assert!(!raw.contains("synopsis"), "{raw}");

        let with = Frontmatter {
            synopsis: "He wakes.".into(),
            ..fm
        };
        assert!(
            render(&with, "")
                .expect("render")
                .contains("synopsis: He wakes.")
        );
    }
}
