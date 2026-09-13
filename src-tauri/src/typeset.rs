//! The typesetting engine. Everything that produces pages goes through here:
//! export calls `compile` then `pdf`, the print preview calls `compile` then
//! `page_png`. There is no second pipeline, so the preview shows the PDF.

use crate::commands::chapter::chapter_path;
use crate::models::frontmatter;
use crate::models::project::ProjectMeta;
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use std::fs;
use std::path::Path;
use std::sync::LazyLock;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::{LazyHash, Scalar};
use typst::{Library, LibraryExt, World};
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;
use typst_render::RenderOptions;

/// Lays out the chapters `ids`, in that order, as one document.
///
/// A chapter whose file is missing fails the whole compile. `list_chapters`
/// skips orphans, but an export that quietly drops a chapter is a book with a
/// hole in it.
pub fn compile(project_dir: &Path, ids: &[String]) -> Result<PagedDocument, String> {
    let meta = ProjectMeta::load(project_dir)?;

    let mut markup = preamble(&meta.name);
    for id in ids {
        let raw = fs::read_to_string(chapter_path(project_dir, id))
            .map_err(|e| format!("Failed to read chapter {id}: {e}"))?;
        let (fm, body) = frontmatter::parse_or_default(&raw, id, &meta.language);
        push_chapter(&mut markup, &fm.title, &fm.language, body);
    }
    typeset(markup)
}

pub fn pdf(doc: &PagedDocument) -> Result<Vec<u8>, String> {
    typst_pdf::pdf(doc, &PdfOptions::default()).map_err(|errors| messages(&errors))
}

/// One page as a PNG. `pixel_per_pt` is the preview's zoom times the screen's
/// pixel ratio; 1.0 is 72 dpi.
pub fn page_png(doc: &PagedDocument, index: usize, pixel_per_pt: f64) -> Result<Vec<u8>, String> {
    let pages = doc.pages();
    let page = pages.get(index).ok_or_else(|| {
        format!(
            "Page {index} does not exist, the document has {} pages.",
            pages.len()
        )
    })?;
    let options = RenderOptions {
        pixel_per_pt: Scalar::new(pixel_per_pt),
        render_bleed: false,
    };
    typst_render::render(page, &options)
        .encode_png()
        .map_err(|e| format!("Failed to encode page image: {e}"))
}

// ponytail: one fixed template. Profiles and presets are F-051.
fn preamble(project_name: &str) -> String {
    format!(
        "#set document(title: {})\n\
         #set page(paper: \"a5\")\n\
         #set text(font: \"Libertinus Serif\", size: 11pt)\n\
         #set par(justify: true, first-line-indent: 1em)\n\n",
        string(project_name)
    )
}

/// Appends one chapter: a page break, its title as the level-1 heading, and the
/// body. The language is scoped to the chapter, since a file's frontmatter can
/// differ from the project's, and it drives hyphenation and quotes.
fn push_chapter(out: &mut String, title: &str, language: &str, body: &str) {
    // typst takes the bare language code, so `es-MX` goes in as `es`
    let lang = language.split(['-', '_']).next().unwrap_or_default();
    out.push_str(&format!(
        "#[\n#set text(lang: {})\n#pagebreak(weak: true)\n#heading(level: 1)[{}]\n\n",
        string(lang),
        escape(title)
    ));
    push_markdown(out, body);
    out.push_str("]\n");
}

/// Converts the markdown the editor writes into typst markup. Covers
/// StarterKit plus the paragraph style markers from `src/services/chapters.ts`.
/// Anything else (images, raw HTML) is dropped and its text, if any, kept.
fn push_markdown(out: &mut String, body: &str) {
    // Every Start pushes what its End writes, so the two stay paired
    let mut closers: Vec<&'static str> = Vec::new();
    let mut style: Option<(&'static str, &'static str)> = None;
    let mut in_code_block = false;

    for event in Parser::new_ext(body, Options::ENABLE_STRIKETHROUGH) {
        match event {
            Event::Start(tag) => {
                // A marker styles the paragraph right below it and nothing else
                let paragraph_style = match &tag {
                    Tag::Paragraph => style.take(),
                    Tag::HtmlBlock => style,
                    _ => {
                        style = None;
                        None
                    }
                };
                let (open, close) = match tag {
                    Tag::Paragraph => match paragraph_style {
                        Some((open, close)) => (open.to_string(), close),
                        None => (String::new(), "\n\n"),
                    },
                    Tag::Heading { level, .. } => {
                        // The chapter title owns level 1
                        (format!("#heading(level: {})[", level as usize + 1), "]\n\n")
                    }
                    Tag::BlockQuote(_) => ("#quote(block: true)[".into(), "]\n\n"),
                    Tag::CodeBlock(kind) => {
                        in_code_block = true;
                        let lang = match kind {
                            CodeBlockKind::Fenced(lang) if !lang.is_empty() => {
                                format!("lang: {}, ", string(&lang))
                            }
                            _ => String::new(),
                        };
                        (format!("#raw(block: true, {lang}\""), "\")\n\n")
                    }
                    Tag::List(Some(start)) => (format!("#enum(start: {start}, "), ")\n\n"),
                    Tag::List(None) => ("#list(".into(), ")\n\n"),
                    Tag::Item => ("[".into(), "], "),
                    Tag::Emphasis => ("#emph[".into(), "]"),
                    Tag::Strong => ("#strong[".into(), "]"),
                    Tag::Strikethrough => ("#strike[".into(), "]"),
                    Tag::Link { dest_url, .. } => (format!("#link({})[", string(&dest_url)), "]"),
                    _ => (String::new(), ""),
                };
                out.push_str(&open);
                closers.push(close);
            }
            Event::End(tag) => {
                if matches!(tag, TagEnd::CodeBlock) {
                    in_code_block = false;
                }
                out.push_str(closers.pop().unwrap_or_default());
            }
            // Inside a code block the text is the body of a string literal
            Event::Text(text) if in_code_block => out.push_str(&string_body(&text)),
            Event::Text(text) => out.push_str(&escape(&text)),
            Event::Code(code) => out.push_str(&format!("#raw({})", string(&code))),
            Event::Html(html) => style = style_marker(&html).or(style),
            Event::SoftBreak => out.push(' '),
            Event::HardBreak => out.push_str("\\\n"),
            Event::Rule => out.push_str("#align(center)[\\* \\* \\*]\n\n"),
            _ => {}
        }
    }
}

/// The open and close of a `<!-- fulgurita:name -->` paragraph style. The looks
/// follow `editor.module.css`. An unknown name styles nothing, as in the editor.
fn style_marker(html: &str) -> Option<(&'static str, &'static str)> {
    let name = html
        .trim()
        .strip_prefix("<!--")?
        .strip_suffix("-->")?
        .trim()
        .strip_prefix("fulgurita:")?;
    Some(match name {
        "verse" => (
            "#block(inset: (left: 2em))[#set par(justify: false, first-line-indent: 0pt)\n#emph[",
            "]]\n\n",
        ),
        "attribution" => ("#align(right)[#emph[", "]]\n\n"),
        "caption" => ("#align(center)[#text(size: 0.9em)[", "]]\n\n"),
        "centered" => ("#align(center)[", "]\n\n"),
        _ => return None,
    })
}

/// Manuscript text as literal typst markup. typst reads `\` followed by any
/// non-space character as that character, so escaping all ASCII punctuation
/// leaves nothing that can start markup: no `#`, `=`, `*`, `//`, `@`, `1.`.
///
/// Straight quotes are the exception. In markup they only ever become smart
/// quotes, and typst picks those per language, which is what a book wants.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if c.is_ascii_punctuation() && c != '"' && c != '\'' {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A typst string literal, quotes included.
fn string(text: &str) -> String {
    format!("\"{}\"", string_body(text))
}

fn string_body(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// Library and fonts are parsed once per process, not once per preview page.
struct Engine {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
}

// Bundled fonts only, never the system's: a project has to set the same pages
// on macOS, Windows and Linux.
static ENGINE: LazyLock<Engine> = LazyLock::new(|| {
    let fonts: Vec<Font> = typst_assets::fonts()
        .flat_map(|data| Font::iter(Bytes::new(data)))
        .collect();
    Engine {
        library: LazyHash::new(Library::default()),
        book: LazyHash::new(FontBook::from_fonts(&fonts)),
        fonts,
    }
});

/// A world with one file in it. The markup is generated and every piece of
/// manuscript text in it is escaped, so nothing can ask for another file.
struct Manuscript {
    source: Source,
}

impl World for Manuscript {
    fn library(&self) -> &LazyHash<Library> {
        &ENGINE.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &ENGINE.book
    }

    fn main(&self) -> FileId {
        self.source.id()
    }

    fn source(&self, _id: FileId) -> FileResult<Source> {
        Ok(self.source.clone())
    }

    fn file(&self, _id: FileId) -> FileResult<Bytes> {
        Err(FileError::AccessDenied)
    }

    fn font(&self, index: usize) -> Option<Font> {
        ENGINE.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<typst::foundations::Duration>) -> Option<Datetime> {
        None
    }
}

fn typeset(markup: String) -> Result<PagedDocument, String> {
    let world = Manuscript {
        source: Source::detached(markup),
    };
    let result = typst::compile::<PagedDocument>(&world).output;
    // typst memoizes across compiles. The CLI evicts after each one too; in an
    // app that stays open all day the cache would otherwise only grow.
    typst::comemo::evict(10);
    result.map_err(|errors| messages(&errors))
}

fn messages(errors: &[SourceDiagnostic]) -> String {
    errors
        .iter()
        .map(|e| e.message.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::chapter::{create_chapter, save_chapter};
    use crate::commands::project::create_project;
    use typst::layout::{Frame, FrameItem};

    fn text_of(frame: &Frame, out: &mut String) {
        for (_, item) in frame.items() {
            match item {
                FrameItem::Group(group) => text_of(&group.frame, out),
                FrameItem::Text(text) => out.push_str(&text.text),
                _ => {}
            }
        }
    }

    /// Every character that reached the page, whitespace dropped, since line
    /// breaking decides where the spaces go.
    fn printed(doc: &PagedDocument) -> String {
        let mut out = String::new();
        for page in doc.pages() {
            text_of(&page.frame, &mut out);
        }
        out.chars().filter(|c| !c.is_whitespace()).collect()
    }

    fn visible(text: &str) -> String {
        text.chars().filter(|c| !c.is_whitespace()).collect()
    }

    #[test]
    fn manuscript_text_that_looks_like_typst_prints_as_written() {
        let text = "= # * _ ` $ @ref <label> [a] {b} (c) // /* */ ~ 1. + - -- --- ... \\ #set #pagebreak() https://x.y";
        let mut markup = preamble("p");
        markup.push_str(&escape(text));

        let doc = typeset(markup).expect("compiles");
        assert_eq!(printed(&doc), visible(text));
    }

    #[test]
    fn straight_quotes_print_as_smart_quotes() {
        let mut markup = preamble("p");
        push_chapter(&mut markup, "T", "en", "\"Two,\" she said. It's #1.");

        let doc = typeset(markup).expect("compiles");
        assert_eq!(printed(&doc), "T\u{201c}Two,\u{201d}shesaid.It\u{2019}s#1.");
    }

    #[test]
    fn every_construct_the_editor_writes_compiles() {
        let body = r#"# Chapter One

Some **bold**, *italic*, ~~struck~~, un*believ*able, `code #x`, and a [link](https://example.com/?a="b").

## A section

- First beat
- Second beat

1. One

   Loose item paragraph.
2. Two

> Nothing is ever lost.

```rust
fn main() { println!("\"hi\""); }
```

---

<!-- fulgurita:verse -->
Whoever keeps the ledger
keeps the *harbour*.

<!-- fulgurita:attribution -->
— A. Reyes

<!-- fulgurita:caption -->
Photograph taken in Lisbon, March 1911.

<!-- fulgurita:centered -->
END OF PART ONE

<!-- fulgurita:unknown -->
Plain after an unknown marker.

<div>raw html</div>

![alt text](missing.png)
"#;
        let mut markup = preamble("p");
        push_chapter(&mut markup, "Title [with] #markup", "es-MX", body);

        let doc = typeset(markup).expect("compiles");
        let printed = printed(&doc);
        assert!(printed.contains("unbelievable"));
        assert!(printed.contains(&visible("Title [with] #markup")));
        assert!(printed.contains("ledger"));
    }

    #[test]
    fn a_project_compiles_to_pdf_and_page_images() {
        let tmp = tempfile::tempdir().expect("tempdir");
        create_project(
            "novel".into(),
            tmp.path().to_string_lossy().into_owned(),
            None,
        )
        .expect("create_project");
        let dir = tmp.path().join("novel");
        let path = dir.to_string_lossy().into_owned();

        let one = create_chapter(path.clone(), "One".into(), None).expect("chapter one");
        let two = create_chapter(path.clone(), "Two".into(), None).expect("chapter two");
        save_chapter(path.clone(), one.id.clone(), "The tide comes in.".into()).expect("save");
        save_chapter(path.clone(), two.id.clone(), "The tide leaves.".into()).expect("save");

        let doc = compile(&dir, &[one.id.clone(), two.id.clone()]).expect("compiles");
        // Each chapter opens on its own page
        assert_eq!(doc.pages().len(), 2);

        assert!(pdf(&doc).expect("pdf").starts_with(b"%PDF"));
        assert!(page_png(&doc, 1, 1.0).expect("png").starts_with(b"\x89PNG"));
        assert!(page_png(&doc, 2, 1.0).is_err());

        assert!(compile(&dir, &[one.id, "missing".into()]).is_err());
    }
}
