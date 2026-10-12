"""Google Drive as the document source.

How it works
------------
1. You sign in with Google once (OAuth 2.0 for desktop apps, with PKCE). Google sends the
   browser back to this app on http://127.0.0.1:<port>/ with a one-time code, which is
   swapped for a refresh token. The refresh token is kept in data/finance.db on this laptop.
2. You pick one Drive folder (e.g. "Finance Manager Docs"). Only that folder and its
   sub-folders are read.
3. "Sync" lists the folder tree through the Drive API and downloads new or changed files
   into a local working copy (data/gdrive_cache/). Everything else in the app — the document
   library, the misfiled-document review, payslip/invoice/TDS extraction — runs on that copy,
   so it works offline between syncs and nothing else had to change.
4. Documents you add in the app are uploaded into the matching Drive sub-folder; moves made in
   the app are made in Drive too. Nothing is ever deleted in Drive.

Each person uses their own Google Cloud OAuth client (type "Desktop app"), so the app works
for anyone who clones it from GitHub without a shared secret.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
# Full Drive scope: needed to read files you put in Drive yourself (drive.file only sees files
# this app created). Access is still limited in practice to the one folder you choose.
SCOPE = "https://www.googleapis.com/auth/drive"
FOLDER = "application/vnd.google-apps.folder"
MANIFEST = ".gdrive_manifest.json"
# Files the app generates in its working copy; never treated as Drive documents.
LOCAL_ONLY = {"facts", "_state", MANIFEST}

_lock = threading.Lock()


class DriveError(RuntimeError):
    pass


# ------------------------------------------------------------------ helpers
def parse_folder_id(text: str) -> str:
    """Accept a folder URL (…/folders/<id>?…) or a bare id."""
    text = (text or "").strip()
    m = re.search(r"/folders/([A-Za-z0-9_-]{10,})", text) or re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", text)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{10,}", text):
        return text
    raise DriveError("That doesn't look like a Google Drive folder link or id.")


def parse_client_json(text: str) -> tuple[str, str]:
    """Read client_id / client_secret from the JSON Google Cloud lets you download."""
    try:
        j = json.loads(text)
    except json.JSONDecodeError as e:
        raise DriveError("The OAuth client file isn't valid JSON.") from e
    body = j.get("installed") or j.get("web") or j
    cid, sec = body.get("client_id"), body.get("client_secret")
    if not cid or not sec:
        raise DriveError("No client_id / client_secret found in that file.")
    return cid, sec


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def auth_url(client_id: str, redirect_uri: str, state: str, challenge: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "include_granted_scopes": "true",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })


def exchange_code(http: httpx.Client, client_id: str, client_secret: str, code: str, verifier: str, redirect_uri: str) -> dict:
    r = _SafeHttp(http).post(TOKEN_URL, data={"client_id": client_id, "client_secret": client_secret, "code": code,
                                   "code_verifier": verifier, "grant_type": "authorization_code", "redirect_uri": redirect_uri})
    j = _json(r)
    if "refresh_token" not in j:
        raise DriveError("Google didn't return a refresh token. Remove the app's access at "
                         "myaccount.google.com/permissions and connect again.")
    return j


def revoke(http: httpx.Client, token: str) -> None:
    try:
        http.post(REVOKE_URL, data={"token": token})
    except httpx.HTTPError:
        pass


def _json(r: httpx.Response) -> dict:
    try:
        j = r.json()
    except ValueError:
        j = {}
    if r.status_code >= 400:
        err = j.get("error")
        msg = (err.get("message") if isinstance(err, dict) else j.get("error_description") or err) or r.text[:200]
        if r.status_code in (401,) or err == "invalid_grant":
            msg = f"Google sign-in expired or was revoked — connect Google Drive again. ({msg})"
        raise DriveError(f"Google Drive: {msg}")
    return j


def _safe_name(name: str) -> str:
    """Drive allows names a Windows file system doesn't."""
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip().rstrip(".")
    return s or "untitled"


# ------------------------------------------------------------------ client
class _SafeHttp:
    """httpx.Client wrapper that turns network failures into a readable DriveError."""

    def __init__(self, http: httpx.Client):
        self._http = http

    def __getattr__(self, method):
        fn = getattr(self._http, method)

        def call(*a, **kw):
            try:
                return fn(*a, **kw)
            except httpx.HTTPError as e:
                raise DriveError(f"Couldn't reach Google Drive — check your internet connection. ({type(e).__name__})") from e
        return call


class Drive:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str, http: httpx.Client | None = None):
        self.client_id, self.client_secret, self.refresh_token = client_id, client_secret, refresh_token
        self.http = _SafeHttp(http or httpx.Client(timeout=60))
        self._token, self._exp = None, 0.0

    # auth
    def token(self) -> str:
        if self._token and time.time() < self._exp - 60:
            return self._token
        j = _json(self.http.post(TOKEN_URL, data={"client_id": self.client_id, "client_secret": self.client_secret,
                                                  "refresh_token": self.refresh_token, "grant_type": "refresh_token"}))
        self._token, self._exp = j["access_token"], time.time() + int(j.get("expires_in", 3600))
        return self._token

    def _h(self) -> dict:
        return {"Authorization": f"Bearer {self.token()}"}

    # read
    def account(self) -> str:
        j = _json(self.http.get(f"{API}/about", params={"fields": "user(emailAddress,displayName)"}, headers=self._h()))
        return j.get("user", {}).get("emailAddress", "")

    def meta(self, file_id: str) -> dict:
        return _json(self.http.get(f"{API}/files/{file_id}", headers=self._h(),
                                   params={"fields": "id,name,mimeType,trashed", "supportsAllDrives": "true"}))

    def children(self, folder_id: str) -> list[dict]:
        out, page = [], None
        while True:
            params = {"q": f"'{folder_id}' in parents and trashed = false", "pageSize": 1000,
                      "fields": "nextPageToken, files(id,name,mimeType,md5Checksum,size,modifiedTime)",
                      "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
            if page:
                params["pageToken"] = page
            j = _json(self.http.get(f"{API}/files", params=params, headers=self._h()))
            out += j.get("files", [])
            page = j.get("nextPageToken")
            if not page:
                return out

    def tree(self, root_id: str) -> tuple[dict, dict, int]:
        """Walk the folder. Returns ({file_id: info+path}, {folder_path: folder_id}, n_google_docs_skipped)."""
        files, folders, skipped = {}, {"": root_id}, 0
        stack = [(root_id, "")]
        while stack:
            fid, prefix = stack.pop()
            seen: set[str] = set()
            for it in sorted(self.children(fid), key=lambda x: (x["name"].lower(), x["id"])):
                name = _safe_name(it["name"])
                if name.lower() in seen:  # Drive allows duplicate names in one folder
                    p = Path(name)
                    name = f"{p.stem} ({it['id'][:6]}){p.suffix}"
                seen.add(name.lower())
                path = f"{prefix}/{name}" if prefix else name
                if it["mimeType"] == FOLDER:
                    folders[path] = it["id"]
                    stack.append((it["id"], path))
                elif it["mimeType"].startswith("application/vnd.google-apps."):
                    skipped += 1  # Google Docs/Sheets have no file to download
                elif path.split("/")[0] not in LOCAL_ONLY:
                    files[it["id"]] = {"path": path, "md5": it.get("md5Checksum"), "modified": it.get("modifiedTime"),
                                       "size": int(it.get("size") or 0)}
        return files, folders, skipped

    def download(self, file_id: str) -> bytes:
        r = self.http.get(f"{API}/files/{file_id}", params={"alt": "media", "supportsAllDrives": "true"}, headers=self._h())
        if r.status_code >= 400:
            _json(r)
        return r.content

    # write
    def create_folder(self, parent_id: str, name: str) -> str:
        j = _json(self.http.post(f"{API}/files", params={"supportsAllDrives": "true", "fields": "id"}, headers=self._h(),
                                 json={"name": name, "mimeType": FOLDER, "parents": [parent_id]}))
        return j["id"]

    def upload(self, parent_id: str, name: str, data: bytes, mime: str = "application/octet-stream") -> dict:
        r = self.http.post(f"{UPLOAD_API}/files", params={"uploadType": "resumable", "supportsAllDrives": "true",
                                                          "fields": "id,md5Checksum,modifiedTime,size"},
                           headers={**self._h(), "X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(len(data))},
                           json={"name": name, "parents": [parent_id]})
        if r.status_code >= 400:
            _json(r)
        loc = r.headers.get("location")
        if not loc:
            raise DriveError("Google Drive didn't accept the upload.")
        return _json(self.http.put(loc, content=data, headers={"Content-Type": mime}))

    def move(self, file_id: str, old_parent: str, new_parent: str, new_name: str) -> dict:
        params = {"supportsAllDrives": "true", "fields": "id,md5Checksum,modifiedTime,size"}
        if old_parent != new_parent:
            params.update(addParents=new_parent, removeParents=old_parent)
        return _json(self.http.patch(f"{API}/files/{file_id}", params=params, headers=self._h(), json={"name": new_name}))


# ------------------------------------------------------------------ working copy
def load_manifest(cache: Path) -> dict:
    try:
        return json.loads((cache / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"root": None, "files": {}, "folders": {}}


def save_manifest(cache: Path, m: dict) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    (cache / MANIFEST).write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")


def _inside(cache: Path, rel: str) -> Path:
    p = (cache / rel).resolve()
    if cache.resolve() not in p.parents:
        raise DriveError(f"Refusing to write outside the working copy: {rel}")
    return p


def sync(drive: Drive, root_id: str, cache: Path) -> dict:
    """Bring the working copy in line with the Drive folder. Only touches files that came from Drive."""
    with _lock:
        cache.mkdir(parents=True, exist_ok=True)
        m = load_manifest(cache)
        if m.get("root") != root_id:  # different folder chosen: start the working copy afresh
            for rec in m.get("files", {}).values():
                try:
                    _inside(cache, rec["path"]).unlink(missing_ok=True)
                except DriveError:
                    pass
            m = {"root": root_id, "files": {}, "folders": {}}
        remote, folders, skipped = drive.tree(root_id)
        stats = {"files": len(remote), "downloaded": 0, "unchanged": 0, "removed": 0, "google_docs_skipped": skipped, "bytes": 0}
        for fid, info in remote.items():
            old = m["files"].get(fid)
            local = _inside(cache, info["path"])
            same = old and old["path"] == info["path"] and local.is_file() and (
                (info["md5"] and old.get("md5") == info["md5"]) or (not info["md5"] and old.get("modified") == info["modified"]))
            if same:
                stats["unchanged"] += 1
                continue
            data = drive.download(fid)
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(data)
            if old and old["path"] != info["path"]:
                _inside(cache, old["path"]).unlink(missing_ok=True)
            m["files"][fid] = info
            stats["downloaded"] += 1
            stats["bytes"] += len(data)
        for fid in [f for f in m["files"] if f not in remote]:  # gone from Drive -> drop the local copy
            _inside(cache, m["files"].pop(fid)["path"]).unlink(missing_ok=True)
            stats["removed"] += 1
        _prune_empty_dirs(cache)
        m["folders"] = folders
        m["synced"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        save_manifest(cache, m)
        return stats


def _prune_empty_dirs(cache: Path) -> None:
    for d in sorted((p for p in cache.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        if d.name not in LOCAL_ONLY and not any(d.iterdir()):
            d.rmdir()


def ensure_folder(drive: Drive, m: dict, folder: str) -> str:
    """Drive id for a sub-folder path like 'Finance/germany', creating missing levels."""
    folder = folder.strip("/")
    folders = m.setdefault("folders", {})
    if folder in folders:
        return folders[folder]
    parent = ""
    for part in folder.split("/"):
        path = f"{parent}/{part}" if parent else part
        if path not in folders:
            folders[path] = drive.create_folder(folders[parent], part)
        parent = path
    return folders[folder]


def push_new_file(drive: Drive, cache: Path, rel_path: str, mime: str = "application/octet-stream") -> dict:
    """Upload a file the app just saved into the working copy to the matching Drive folder."""
    with _lock:
        m = load_manifest(cache)
        if not m.get("root"):
            raise DriveError("Sync Google Drive once before adding documents.")
        folder, name = rel_path.rsplit("/", 1) if "/" in rel_path else ("", rel_path)
        parent = ensure_folder(drive, m, folder)
        j = drive.upload(parent, name, _inside(cache, rel_path).read_bytes(), mime)
        m["files"][j["id"]] = {"path": rel_path, "md5": j.get("md5Checksum"), "modified": j.get("modifiedTime"),
                               "size": int(j.get("size") or 0)}
        save_manifest(cache, m)
        return j


def push_move(drive: Drive, cache: Path, old_rel: str, new_rel: str) -> None:
    """Mirror a move/rename made in the app's working copy in Drive."""
    with _lock:
        m = load_manifest(cache)
        fid = next((k for k, v in m["files"].items() if v["path"] == old_rel), None)
        if not fid:
            raise DriveError("This file isn't in the synced Drive folder — sync first.")
        old_folder = old_rel.rsplit("/", 1)[0] if "/" in old_rel else ""
        new_folder, new_name = new_rel.rsplit("/", 1) if "/" in new_rel else ("", new_rel)
        j = drive.move(fid, ensure_folder(drive, m, old_folder), ensure_folder(drive, m, new_folder), new_name)
        m["files"][fid].update(path=new_rel, md5=j.get("md5Checksum") or m["files"][fid].get("md5"),
                               modified=j.get("modifiedTime") or m["files"][fid].get("modified"))
        save_manifest(cache, m)
