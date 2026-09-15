# 2. Sensitive audio and research material

- Date: 2026-09-14
- Status: Accepted
- Linear: FUL-109, FUL-89, FUL-93, FUL-99

## Context

F-106 adds a research folder and F-110 adds interview recordings. Both put
material about sources inside a project, and whichever of them lands first sets
the on-disk format. We decide the policy here so the format follows it.

FUL-99 decided how Fulgurita handles sensitive text, mostly source identities.
Its ADR was written but never committed, and the file is not in the repository,
its history or any stash. What survives is the summary on FUL-99 in Linear. This
ADR restates the parts it builds on so it can be read alone:

- Three tiers: `on_record`, `protected` (the default) and `sealed`.
- Identity is separated from content. The identity lives in a vault outside the
  project tree, per project, in the app data directory.
- The vault key sits in the OS credential store by default. `sealed` requires a
  passphrase.
- Unlock is just-in-time. Locking zeroizes the key, it is not a UI state. `sealed`
  never opens a session.
- Only content in the project tree is indexed.
- A deleted identity is really deleted.

The last two come from how FUL-109 cites D6 and D8. The original wording is lost.

Audio breaks the first model. In the source tracker the identity is a field we
can move somewhere else. In a recording the voice identifies the person, so there
is no quote to keep once the name is gone. Recordings are also large. F-119a
decrypts the vault whole in memory, which works for a small file and does not
work for a 400 MB `.m4a`.

## Decision

### 1. Location follows the tier

`on_record` material lives in `research/` in the project tree as ordinary files.
It syncs with the rest of the project.

`protected` and `sealed` material lives outside the tree, in
`{app_local_data_dir}/fulgurita/vaults/{project_uuid}/media/`, next to the vault.
Nothing in the tree points at it by path. `fulgurita.json` has no project UUID
today, F-119a adds it.

### 2. Filenames

Files in the media store are named `{uuid}.enc`. The display name and the
original filename are stored in the vault, encrypted.

Files in `research/` keep the name the user gave them. The filename non-guarantee
from FUL-108 still covers them.

Importing into the media store copies the file and leaves the original where it
was. The import tells the user the original still exists and offers to move it to
the OS trash. That is an ordinary delete and the UI says so.

### 3. Encrypting large files

Each file gets its own random data key. The vault key wraps the data key and the
wrapped key is stored in the vault.

The file is encrypted with XChaCha20-Poly1305 in the STREAM construction: fixed
64 KiB chunks, the chunk counter and a last-chunk flag in the nonce. Any chunk can
be decrypted on its own, which is what seeking needs, and a truncated file fails
authentication. Decryption streams, the whole file is never in memory.

F-119a picks the crate.

### 4. Playback

We never write a plaintext temp file.

Rust registers a custom URI scheme that serves decrypted chunks to `<audio>` and
honours HTTP Range requests. The scheme answers only while the item is unlocked. A
lock signal from D9 ends the stream. `sealed` asks for the passphrase on every
playback.

The decrypted bytes end up in the webview's media buffers, which we cannot
zeroize. That goes on the non-guarantee list.

`protected` and `sealed` media has no "open with another app". Handing a file to
another app means plaintext on disk.

### 5. Transcriptions

A transcript inherits the tier of its recording and is stored with it.

`protected` and `sealed` transcripts are encrypted in the media store and never
reach the SQLite index. They can contain names the person said out loud, and the
index is plaintext on disk.

`on_record` transcripts are `.md` files in `research/`. They are indexed when
search includes `research/`.

### 6. Remote processing

Fulgurita does not send `protected` or `sealed` material off the machine. If we
build remote transcription, it is disabled for those tiers. A warning is not
enough, a recording that went to a server stays there.

F-110 starts by importing a transcript made elsewhere, so this costs it nothing
today.

### 7. Deletion is crypto-shredding

Deleting a `protected` or `sealed` file removes its wrapped data key from the
vault, deletes the ciphertext, and rotates the vault key. Rotation rewraps the
remaining data keys. It does not re-encrypt any media.

What we promise: after a delete, nothing Fulgurita holds can decrypt the file.

We do not promise the bytes are gone from the disk.

### 8. What this means for F-106

`research/` is on-record material and has no tiers. It syncs. It does not count
toward word count, it does not appear in the corkboard, and it is not exported.
Search leaves it out by default, as F-106 already says.

Marking a research file `protected` is an import into the media store, and
decision 2 covers the file left behind in `research/`.

## Rationale

The tier already says what the user wants from a file, so we let it decide where
the file lives. An on-record interview gets Finder preview, drag and drop and
whatever audio app the user likes, because nothing about it needs hiding. A
protected one gets none of that, and the user chose that when they picked the
tier.

Keeping protected media out of the tree follows FUL-99. An ignore rule asks sync
software we do not control to behave. A file outside the synced folder is not
synced.

A data key per file is what makes deletion honest. On an SSD, wear leveling means
overwriting a file does not reach the blocks that held it, so "securely deleted"
is not something we can check. Destroying the only key is.

Per-chunk authentication lets the URI scheme decrypt exactly the range the audio
element asks for. Without it, seeking to minute 40 means decrypting 40 minutes
first, or keeping plaintext around to seek in.

## Consequences

- F-106 is unblocked with the scope it has. Its open question about sync is
  answered: `research/` syncs.
- F-119a grows. It needs the project UUID in `fulgurita.json`, the `media/`
  directory, data-key wrapping and key rotation on delete.
- F-110 needs the URI scheme and a playback path that checks lock state.
- F-120 gets new non-guarantees:
  - The original file a recording was imported from, and anything the SSD kept
    of it.
  - Decrypted audio in the webview's media buffers.
  - Revisions the sync service kept of anything that was ever in the tree,
    including a file later marked `protected`.
  - A backup of the app data directory holding an old vault, together with a
    keychain that is backed up or synced. From those two a deleted file can be
    decrypted.
- Users lose Finder preview, drag and drop and "open with" for protected media.

## Rejected alternatives

**Everything in the vault.** On-record interviews would lose native tools and
gain no protection, because there is nothing to protect.

**Everything in the tree, encrypted in place.** The tree syncs by default, which
is what FUL-99 kept identities away from. Opaque names in `research/` would also
make the folder useless outside Fulgurita. And a small edit to a large encrypted
file is a large upload and an easy sync conflict.

**A plaintext temp file for playback or "open with".** It is the easy way to play
encrypted audio and it is the leak. Temp directories get backed up, indexed by
the OS, and left behind after a crash.

**Decrypting the whole file in memory.** The F-119a model. It does not fit a
400 MB recording and it makes seeking cost a full decrypt.

**Overwriting the file on delete.** Wear leveling and filesystem journals make it
a promise we cannot verify, and FUL-108 exists to keep us from making those.

**UUID names for files in the tree.** The user could no longer find their own
files outside Fulgurita, and tree material is on-record, so the names hide
nothing the tier cares about.

## Open questions

These do not block F-106 or F-119a.

- Does the encrypted vault export from FUL-99 include media, or is exporting
  media a separate step? A 400 MB recording in every vault export is a lot.
- Video. Nothing here is audio-specific, but 64 KiB chunks were picked with audio
  in mind.
- Where the import asks for the tier, and what it defaults to for a file dropped
  into `research/` by hand. Today the answer is on-record, because that is what
  the folder is.
- FUL-99's 15-minute session timeout was a guess. Transcribing an interview is a
  long session and may be the first real test of it.

## Follow-up

- FUL-114 rewrites FUL-99's lost ADR from the Linear summary, fills in D5 to D8,
  and checks this ADR's restatement against it.
- FUL-110 now names `fulgurita/` in the vault path and carries the project UUID,
  the media store, data-key wrapping and crypto-shredding.
- FUL-108 lists the non-guarantees from Consequences.
- F-121 was used by two tickets. FUL-112 keeps it, as `FEATURES.md` already
  says, and FUL-109 is F-122.
