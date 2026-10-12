"""Google Drive integration — tested against a fake Drive API (no network, no Google account)."""
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fincore import gdrive  # noqa: E402

FOLDER = gdrive.FOLDER


class FakeDrive:
    """Just enough of Drive v3 + OAuth token endpoint for the app's calls."""

    def __init__(self):
        self.items = {"ROOT": {"id": "ROOT", "name": "Finance Manager Docs", "mimeType": FOLDER, "parents": []}}
        self.blobs, self.n, self.token_calls = {}, 0, 0

    def add(self, parent, name, data=None, mime="application/pdf"):
        self.n += 1
        fid = f"id{self.n:04d}xxxxxx"
        it = {"id": fid, "name": name, "mimeType": FOLDER if data is None else mime, "parents": [parent],
              "modifiedTime": f"2026-10-12T10:{self.n:02d}:00Z"}
        if data is not None:
            it.update(md5Checksum=hashlib.md5(data).hexdigest(), size=str(len(data)))
            self.blobs[fid] = data
        self.items[fid] = it
        return fid

    def handler(self, req: httpx.Request) -> httpx.Response:
        url, q = req.url, dict(req.url.params)
        if url.host == "oauth2.googleapis.com":
            body = parse_qs(req.content.decode())
            if url.path == "/token":
                self.token_calls += 1
                if body["grant_type"][0] == "authorization_code":
                    assert body["code_verifier"][0]
                    return httpx.Response(200, json={"access_token": "AT", "expires_in": 3600, "refresh_token": "RT"})
                return httpx.Response(200, json={"access_token": "AT", "expires_in": 3600})
            return httpx.Response(200, json={})
        path = url.path
        if not path.startswith("/upload/session/"):  # resumable session URLs carry their own auth
            assert req.headers["authorization"] == "Bearer AT"
        if path == "/drive/v3/about":
            return httpx.Response(200, json={"user": {"emailAddress": "me@example.com"}})
        if path == "/drive/v3/files" and req.method == "GET":
            parent = q["q"].split("'")[1]
            kids = [i for i in self.items.values() if parent in i["parents"]]
            return httpx.Response(200, json={"files": kids})
        if path == "/drive/v3/files" and req.method == "POST":
            j = json.loads(req.content)
            return httpx.Response(200, json={"id": self.add(j["parents"][0], j["name"])})
        if path.startswith("/drive/v3/files/"):
            fid = path.rsplit("/", 1)[1]
            if fid not in self.items:
                return httpx.Response(404, json={"error": {"message": f"File not found: {fid}."}})
            if req.method == "PATCH":
                it = self.items[fid]
                it["name"] = json.loads(req.content)["name"]
                if "addParents" in q:
                    it["parents"] = [q["addParents"]]
                return httpx.Response(200, json=it)
            if q.get("alt") == "media":
                return httpx.Response(200, content=self.blobs[fid])
            return httpx.Response(200, json=self.items[fid])
        if path == "/upload/drive/v3/files" and req.method == "POST":
            j = json.loads(req.content)
            self._pending = j
            return httpx.Response(200, headers={"location": "https://www.googleapis.com/upload/session/1"})
        if path == "/upload/session/1":
            fid = self.add(self._pending["parents"][0], self._pending["name"], req.content)
            return httpx.Response(200, json=self.items[fid])
        return httpx.Response(404, json={"error": {"message": f"no route {req.method} {path}"}})


@pytest.fixture
def fake():
    f = FakeDrive()
    fin = f.add("ROOT", "Finance")
    de = f.add(fin, "germany")
    f.add(de, "Brutto-Netto-Abrechnung 2023 04 April.pdf", b"%PDF payslip april")
    f.add(de, "Lohnsteuerbescheinigung 2023.pdf", b"%PDF lstb")
    f.add("ROOT", "README.md", b"# docs", "text/markdown")
    f.add("ROOT", "Notes", None)                             # empty folder
    f.add("ROOT", "Budget", b"", "application/vnd.google-apps.spreadsheet")  # Google Sheet: no file
    return f


def client(fake):
    return gdrive.Drive("cid.apps.googleusercontent.com", "sec", "RT", httpx.Client(transport=httpx.MockTransport(fake.handler)))


def test_parse_inputs():
    assert gdrive.parse_folder_id("https://drive.google.com/drive/folders/1FKDPYGtBbgKbV-Nvh4P0nlOdeNChH2fL?usp=sharing") == "1FKDPYGtBbgKbV-Nvh4P0nlOdeNChH2fL"
    assert gdrive.parse_folder_id("1FKDPYGtBbgKbV-Nvh4P0nlOdeNChH2fL") == "1FKDPYGtBbgKbV-Nvh4P0nlOdeNChH2fL"
    with pytest.raises(gdrive.DriveError):
        gdrive.parse_folder_id("not a link")
    cid, sec = gdrive.parse_client_json('{"installed":{"client_id":"x.apps.googleusercontent.com","client_secret":"s"}}')
    assert (cid, sec) == ("x.apps.googleusercontent.com", "s")
    with pytest.raises(gdrive.DriveError):
        gdrive.parse_client_json('{"installed":{}}')


def test_auth_url_uses_pkce_and_offline_access():
    v, c = gdrive.pkce_pair()
    assert len(v) >= 43 and "=" not in c
    q = parse_qs(urlparse(gdrive.auth_url("cid", "http://127.0.0.1:8770/", "st", c)).query)
    assert q["code_challenge"] == [c] and q["code_challenge_method"] == ["S256"]
    assert q["access_type"] == ["offline"] and q["redirect_uri"] == ["http://127.0.0.1:8770/"] and q["state"] == ["st"]


def test_exchange_code(fake):
    http = httpx.Client(transport=httpx.MockTransport(fake.handler))
    assert gdrive.exchange_code(http, "cid", "sec", "CODE", "verifier", "http://127.0.0.1:8770/")["refresh_token"] == "RT"


def test_sync_downloads_then_is_incremental(fake, tmp_path):
    d, cache = client(fake), tmp_path / "cache"
    s1 = gdrive.sync(d, "ROOT", cache)
    assert (s1["files"], s1["downloaded"], s1["google_docs_skipped"]) == (3, 3, 1)
    assert (cache / "Finance/germany/Brutto-Netto-Abrechnung 2023 04 April.pdf").read_bytes() == b"%PDF payslip april"
    assert (cache / "README.md").exists()
    m = gdrive.load_manifest(cache)
    assert m["folders"]["Finance/germany"] and m["folders"]["Notes"]
    assert gdrive.sync(d, "ROOT", cache)["downloaded"] == 0           # nothing changed -> nothing downloaded
    assert fake.token_calls == 1                                        # access token is reused


def test_sync_picks_up_changes_renames_and_deletes(fake, tmp_path):
    d, cache = client(fake), tmp_path / "cache"
    gdrive.sync(d, "ROOT", cache)
    (cache / "facts").mkdir()
    (cache / "facts" / "germany_payslips.json").write_text("[]")      # generated locally: must survive syncs
    fid = next(k for k, v in fake.items.items() if v["name"] == "README.md")
    fake.blobs[fid] = b"# docs v2"
    fake.items[fid]["md5Checksum"] = hashlib.md5(b"# docs v2").hexdigest()
    lst = next(k for k, v in fake.items.items() if v["name"].startswith("Lohnsteuer"))
    fake.items[lst]["name"] = "Lohnsteuerbescheinigung 2023 (renamed).pdf"
    gone = next(k for k, v in fake.items.items() if v["name"].startswith("Brutto"))
    del fake.items[gone]
    s = gdrive.sync(d, "ROOT", cache)
    assert (s["downloaded"], s["removed"]) == (2, 1)
    assert (cache / "README.md").read_bytes() == b"# docs v2"
    assert (cache / "Finance/germany/Lohnsteuerbescheinigung 2023 (renamed).pdf").exists()
    assert not (cache / "Finance/germany/Lohnsteuerbescheinigung 2023.pdf").exists()
    assert not (cache / "Finance/germany/Brutto-Netto-Abrechnung 2023 04 April.pdf").exists()
    assert (cache / "facts" / "germany_payslips.json").exists()


def test_duplicate_and_unsafe_names(fake, tmp_path):
    fake.add("ROOT", "scan.pdf", b"a")
    fake.add("ROOT", "scan.pdf", b"b")
    fake.add("ROOT", 'Rechnung: 03/2026?.pdf', b"c")
    cache = tmp_path / "cache"
    gdrive.sync(client(fake), "ROOT", cache)
    names = sorted(p.name for p in cache.iterdir() if p.is_file() and p.suffix == ".pdf")
    assert len(names) == 3 and "scan.pdf" in names
    assert any(n.startswith("Rechnung_ 03_2026_") for n in names)


def test_upload_new_file_creates_missing_folders(fake, tmp_path):
    d, cache = client(fake), tmp_path / "cache"
    gdrive.sync(d, "ROOT", cache)
    rel = "Finance/germany/Receipts/2026/2026-10-01_Rechnung.pdf"
    (cache / rel).parent.mkdir(parents=True)
    (cache / rel).write_bytes(b"%PDF receipt")
    gdrive.push_new_file(d, cache, rel, "application/pdf")
    up = next(v for v in fake.items.values() if v["name"] == "2026-10-01_Rechnung.pdf")
    assert fake.items[up["parents"][0]]["name"] == "2026"
    assert gdrive.sync(d, "ROOT", cache)["downloaded"] == 0   # our own upload isn't downloaded again


def test_move_is_mirrored_in_drive(fake, tmp_path):
    d, cache = client(fake), tmp_path / "cache"
    gdrive.sync(d, "ROOT", cache)
    gdrive.push_move(d, cache, "README.md", "Finance/README_root.md")
    it = next(v for v in fake.items.values() if v["name"] == "README_root.md")
    assert fake.items[it["parents"][0]]["name"] == "Finance"
    with pytest.raises(gdrive.DriveError):
        gdrive.push_move(d, cache, "nope.pdf", "x/nope.pdf")


def test_switching_folder_clears_old_working_copy(fake, tmp_path):
    d, cache = client(fake), tmp_path / "cache"
    gdrive.sync(d, "ROOT", cache)
    other = fake.add("ROOT", "Other")
    fake.add(other, "only.pdf", b"x")
    gdrive.sync(d, other, cache)
    assert (cache / "only.pdf").exists() and not (cache / "README.md").exists()


def test_writes_stay_inside_working_copy(tmp_path):
    with pytest.raises(gdrive.DriveError):
        gdrive._inside(tmp_path, "../escape.pdf")


def test_network_failure_is_a_readable_error():
    def boom(req):
        raise httpx.ConnectError("offline")
    d = gdrive.Drive("c", "s", "RT", httpx.Client(transport=httpx.MockTransport(boom)))
    with pytest.raises(gdrive.DriveError, match="internet"):
        d.account()


def test_unknown_folder_is_reported(fake):
    with pytest.raises(gdrive.DriveError, match="not found"):
        client(fake).meta("doesnotexist1234")
