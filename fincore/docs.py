"""Document intake: read a file, work out what it is, and decide where it belongs.

Pipeline:  bytes -> extract_text() -> classify() -> plan (category, folder, file name, fields)
           -> file_document() copies it into your planner folder and logs it in the database.

Classification is rule-based and runs offline: each rule looks for tell-tale words in the
document text (spaces removed, because some German PDFs come out as "A br e c h n u ng")
and in the file name. If no rule is confident and a Claude key is set, Claude can be asked
as a fallback. Nothing is deleted; files are copied (upload) or moved (tidy-up) only when
you confirm.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import zipfile
from datetime import date, datetime
from pathlib import Path

CATEGORIES = ["Salary & payslips", "Tax — Germany", "Tax — India", "Property — Gera flat", "Bank statements",
              "Investments", "Insurance", "Receipts & bills", "Social security & pension", "Employment", "Career", "Other"]

DE_MONTHS = {"januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7,
             "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12}
DE_MONTH_NAMES = ["Januar", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
EN_MONTHS = {m.lower(): i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

GERA = "Finance/india/home_Gera_ioj"
# Gera milestone words -> stage number & folder label (registered Fifth Schedule order)
GERA_STAGE_WORDS = [
    ("signing", 1, "Signing"), ("excavation", 3, "Excavation"), ("foundation", 4, "Foundation"),
    ("retaining", 5, "RetainingWall"), ("4thslab", 6, "4thSlab"), ("fourthslab", 6, "4thSlab"),
    ("12thslab", 7, "12thSlab"), ("twelfthslab", 7, "12thSlab"), ("20thslab", 8, "20thSlab"),
    ("masonry", 9, "Blockwork"), ("blockwork", 9, "Blockwork"), ("25thslab", 10, "25thSlab"),
    ("terrace", 11, "TerraceSlab"), ("plaster", 12, "Plaster"), ("flooring", 13, "Flooring"),
    ("plumbing", 14, "Plumbing"), ("lift", 15, "Lifts"), ("occupancy", 16, "Occupancy"), ("possession", 17, "Possession"),
]


# ------------------------------------------------------------------ extraction
def extract_text(data: bytes, filename: str, max_pages: int = 6) -> tuple[str, str]:
    """Return (text, method). Never raises."""
    ext = Path(filename).suffix.lower()
    try:
        if ext == ".pdf":
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                txt = "\n".join((p.extract_text() or "") for p in pdf.pages[:max_pages])
            return txt, "pdf-text" if txt.strip() else "pdf-scan (no text layer)"
        if ext in (".xls", ".xlsx", ".csv"):
            import pandas as pd
            if ext == ".csv":
                df = pd.read_csv(io.BytesIO(data), header=None, dtype=str, on_bad_lines="skip", encoding_errors="ignore")
                frames = [df]
            else:
                frames = list(pd.read_excel(io.BytesIO(data), sheet_name=None, header=None, dtype=str).values())
            rows = []
            for df in frames:
                for r in df.head(80).fillna("").values.tolist():
                    rows.append(" | ".join(str(x) for x in r if str(x).strip()))
            return "\n".join(rows), "spreadsheet"
        if ext == ".docx":
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                xml = z.read("word/document.xml").decode("utf8", "ignore")
            return re.sub(r"<[^>]+>", " ", xml), "docx"
        if ext in (".txt", ".md", ".json", ".xml", ".html"):
            return data.decode("utf8", "ignore"), "text"
        if ext in (".png", ".jpg", ".jpeg", ".webp", ".heic"):
            return "", "image (no text layer)"
    except Exception as e:  # noqa: BLE001
        return "", f"unreadable ({type(e).__name__})"
    return "", "unsupported type"


def squash(s: str) -> str:
    return re.sub(r"[\s\-_.,:/()|]+", "", s.lower())


# ------------------------------------------------------------------ fields
def _to_float(s: str) -> float | None:
    s = s.strip().replace("₹", "").replace("€", "").replace("Rs.", "").replace("Rs", "").strip()
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d{1,2})?", s):         # 1.234.567,89 (German)
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(,\d{2,3})+(\.\d{1,2})?", s):     # 1,23,456.78 / 1,234,567.89
        s = s.replace(",", "")
    elif re.fullmatch(r"-?\d+,\d{1,2}", s):
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def find_dates(text: str) -> list[str]:
    out = []
    for d, m, y in re.findall(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b", text):
        try:
            out.append(date(int(y), int(m), int(d)).isoformat())
        except ValueError:
            pass
    for y, m, d in re.findall(r"\b(20\d{2})-(\d{2})-(\d{2})", text):
        try:
            out.append(date(int(y), int(m), int(d)).isoformat())
        except ValueError:
            pass
    for d, mon, y in re.findall(r"\b(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(20\d{2})\b", text):
        if mon.lower() in EN_MONTHS:
            try:
                out.append(date(int(y), EN_MONTHS[mon.lower()], int(d)).isoformat())
            except ValueError:
                pass
    return out


def fields(text: str, filename: str) -> dict:
    f: dict = {}
    t = text
    if m := re.search(r"Acknowledgement Number\s*:?\s*([A-Z]{2,3}\d{7,8})", t):
        f["ack_no"] = m.group(1)
    if m := re.search(r"\b(\d{14}[A-Z]{4})\b", t):
        f["cin"] = m.group(1)
    if m := re.search(r"Invoice No\.?\s*:?\s*(\d{6,})", t):
        f["invoice_no"] = m.group(1)
    if m := re.search(r"Certificate No\.?\s*:?\s*([\w/]+)", t):
        f["certificate_no"] = m.group(1)
    if m := re.search(r"Bank Reference No\s*:?\s*(\d+)", t):
        f["bank_ref"] = m.group(1)
    if m := re.search(r"(?:Transaction Amount\(Rs\.\)|Total Amount \(in Rs\.\)|Amount \(in Rs\.\)|Total Amount)\s*:?\s*₹?\s*([\d,]+(?:\.\d+)?)", t):
        f["amount"] = _to_float(m.group(1)); f["currency"] = "INR"
    if m := re.search(r"(?:Auszahlungsbetrag|Netto-?Bezüge|Überweisung)\D{0,30}([\d.]+,\d{2})", t):
        f.setdefault("amount", _to_float(m.group(1))); f.setdefault("currency", "EUR")
    sq = squash(t)
    mm = re.search(r"f(?:ü|u)r(januar|februar|m(?:ä|a)e?rz|april|mai|juni|juli|august|september|oktober|november|dezember)(20\d{2})", sq)
    if mm:
        mon = mm.group(1).replace("marz", "märz")
        f["period"] = f"{mm.group(2)}-{DE_MONTHS.get(mon, DE_MONTHS.get('märz')):02d}"
    if m := re.search(r"lohnsteuerbescheinigungf(?:ü|u)r(20\d{2})", sq):
        f["tax_year"] = m.group(1)
    if m := re.search(r"(?:Assessment Year|Tax Year)\s*:?\s*(20\d{2}-\d{2})", t):
        f["assessment_year"] = m.group(1)
    if m := re.search(r"as on date\s*(\d{2}\.\d{2}\.20\d{2})", t):
        f["as_on"] = find_dates(m.group(1))[0]
    ds = list(dict.fromkeys(find_dates(t)))  # document order, de-duplicated
    if ds:
        f["dates"] = ds[:8]
    return f


# ------------------------------------------------------------------ rules
# (doc_type, label, category, country, all_of, any_of, filename_hints, confidence)
RULES = [
    ("de_payslip", "German payslip", "Salary & payslips", "DE", [], ["bruttonetto", "abrechnungderbrutto", "entgeltabrechnung", "verdienstabrechnung", "gehaltsabrechnung"], ["brutto-netto", "gehaltsabrechnung", "entgeltabrechnung"], .95),
    ("de_lohnsteuerbescheinigung", "Lohnsteuerbescheinigung (annual wage-tax certificate)", "Tax — Germany", "DE", ["lohnsteuerbescheinigung"], [], ["lohnsteuerbescheinigung"], .95),
    ("de_tax_return", "German income tax return (Einkommensteuererklärung)", "Tax — Germany", "DE", [], ["einkommensteuererklärung", "einkommensteuererklarung", "hauptvordruckest"], ["steuererklaerung", "steuererklärung", "est1a"], .97),
    ("de_tax_assessment", "German tax assessment (Steuerbescheid)", "Tax — Germany", "DE", [], ["bescheidfür", "einkommensteuerbescheid", "festsetzungderein"], ["steuerbescheid", "bescheid"], .9),
    ("de_tax_class", "Tax-class change (Steuerklassenwechsel)", "Tax — Germany", "DE", [], ["steuerklassenwechsel", "antragaufsteuerklassen"], ["steuerklassenwechsel"], .9),
    ("de_social_security", "Social-security notice (Meldebescheinigung / Rentenversicherung)", "Social security & pension", "DE", [], ["meldebescheinigungzursozial", "renteninformation", "deutscherentenversicherung"], ["meldebescheinigung", "renteninformation"], .97),
    ("de_compensation", "Employer compensation statement", "Employment", "DE", [], ["compensationstatement", "annualbasepay"], ["annual-review", "compensation"], .85),
    ("de_bank_statement", "German bank statement (Kontoauszug)", "Bank statements", "DE", [], ["kontoauszug", "umsatzübersicht", "iban de", "ibande"], ["kontoauszug", "umsaetze", "deutsche bank", "commerzbank"], .8),
    ("de_broker", "German broker / depot document", "Investments", "DE", [], ["wertpapierabrechnung", "depotauszug", "traderepublic", "scalablecapital", "comdirect", "jahressteuerbescheinigung"], ["depot", "wertpapier", "trade republic", "scalable"], .8),
    ("de_insurance", "Insurance document (Versicherung)", "Insurance", "DE", [], ["versicherungsschein", "beitragsrechnung", "versicherungsnummer", "haftpflicht", "krankenversicherung"], ["versicherung", "police"], .75),
    ("in_gera_invoice", "Gera milestone tax invoice", "Property — Gera flat", "IN", ["taxinvoice", "gera"], [], ["invoice"], .95),
    ("in_gera_certificate", "Gera work-progress certificate", "Property — Gera flat", "IN", ["certify", "gera"], ["towhomsoever", "statusofworkonsite"], ["certificate"], .9),
    ("in_gera_receipt", "Gera payment receipt", "Property — Gera flat", "IN", ["receivedwiththanks"], ["islandofjoy", "gera"], ["gerareceipt"], .9),
    ("in_bank_ereceipt", "Bank transfer e-receipt to Gera", "Property — Gera flat", "IN", ["ereceipt"], ["geraisland", "1a806"], ["e-receipt", "bankreceipt"], .85),
    ("in_tds_statement", "TDS on property — Form 26QB / Form 141 statement", "Tax — India", "IN", [], ["form26qb", "form141", "section393", "section194ia"], ["26qb", "challanstatement", "_statement"], .95),
    ("in_tds_challan", "TDS challan receipt (income-tax department)", "Tax — India", "IN", ["challanreceipt"], ["tdsonsaleofproperty", "minorhead"], ["challanreceipt"], .9),
    ("in_tds_bank_advice", "Bank payment advice for TDS", "Tax — India", "IN", ["paymentadvice"], ["directtax", "majorhead0020"], ["bankadvice"], .85),
    ("in_gera_soa", "Gera statement of account", "Property — Gera flat", "IN", ["statementofaccount"], ["gera", "islandofjoy"], ["soa"], .9),
    ("in_gera_interest", "Gera interest calculation sheet", "Property — Gera flat", "IN", ["interestcalculationsheet"], [], ["interestcalc"], .9),
    ("in_gera_agreement", "Gera agreement / allotment / cost sheet", "Property — Gera flat", "IN", [], ["allotmentletter", "costestimate", "agreementforsale", "paymentplan"], ["allotment", "costsheet", "agreement", "paymentplan"], .85),
    ("in_bank_statement", "Indian bank statement", "Bank statements", "IN", [], ["transactionhistory", "accountstatement", "icicibank", "hdfcbank", "statebankofindia", "withdrawalamount"], ["optransactionhistory", "statement"], .75),
    ("in_epfo", "EPF / provident fund document", "Social security & pension", "IN", [], ["employeesprovidentfund", "epfo", "uan", "passbook"], ["epfo", "epf", "uan"], .8),
    ("in_cas", "Mutual-fund CAS (CAMS / KFintech)", "Investments", "IN", [], ["consolidatedaccountstatement", "camsonline", "kfintech"], ["cas", "cams", "kfin"], .9),
    ("in_income_tax", "Indian income-tax document (Form 16 / 26AS / AIS / ITR)", "Tax — India", "IN", [], ["form16", "form26as", "annualinformationstatement", "itrv", "indianincometaxreturn", "acknowledgementitr"], ["form16", "26as", "ais", "itr"], .85),
    ("career", "CV / cover letter / career document", "Career", "", [], ["curriculumvitae", "professionalsummary", "coverletter", "workexperience"], ["cv", "resume", "cover_letter", "bio"], .8),
    ("de_receipt", "Receipt or bill (Rechnung) — may be tax-deductible", "Receipts & bills", "DE", ["rechnung"], ["mwst", "ust", "€", "eur"], ["rechnung", "quittung", "receipt"], .6),
]


def classify(text: str, filename: str) -> dict:
    sq, fn = squash(text), filename.lower()
    best = None
    for rid, label, cat, country, all_of, any_of, fhints, conf in RULES:
        ok_all = all(squash(w) in sq for w in all_of) if all_of else True
        hit_any = any(squash(w) in sq for w in any_of) if any_of else bool(all_of)
        by_text = bool(sq) and ok_all and hit_any
        by_name = any(h in fn for h in fhints)
        if by_text:
            score = conf + (0.03 if by_name else 0)
        elif by_name:
            score = conf * (0.7 if sq else 0.75)   # name-only match: less sure
        else:
            continue
        if not best or score > best["confidence"]:
            best = {"doc_type": rid, "label": label, "category": cat, "country": country, "confidence": round(min(score, .99), 2),
                    "matched_on": "text + file name" if by_text and by_name else "text" if by_text else "file name only"}
    return best or {"doc_type": "unknown", "label": "Not recognised", "category": "Other", "country": "", "confidence": 0.0, "matched_on": "nothing"}


# ------------------------------------------------------------------ routing
def _safe(s: str) -> str:
    return re.sub(r"[^\w\-. ]+", "", s).strip().replace(" ", "_")[:80] or "document"


def gera_stage_from_text(sq: str) -> tuple[int, str] | None:
    for word, n, label in GERA_STAGE_WORDS:
        if word in sq:
            return n, label
    return None


def gera_stage_folder(root: Path, stage: tuple[int, str] | None, when: str | None) -> str:
    base = root / GERA / "3_Milestones"
    existing = sorted(p.name for p in base.iterdir() if p.is_dir()) if base.exists() else []
    if stage:
        for name in existing:
            if name.startswith(f"{stage[0]:02d}_"):
                return f"{GERA}/3_Milestones/{name}"
        ym = (when or date.today().isoformat())[:7]
        return f"{GERA}/3_Milestones/{stage[0]:02d}_{stage[1]}_{ym}"
    if when:  # receipts: pick the milestone folder dated in the same or previous month
        ym = when[:7]
        cands = [n for n in existing if re.search(r"_(\d{4}-\d{2})$", n) and re.search(r"_(\d{4}-\d{2})$", n).group(1) <= ym]
        if cands:
            return f"{GERA}/3_Milestones/{max(cands, key=lambda n: n[-7:])}"
    return f"{GERA}/3_Milestones/_Unsorted"


def plan(root: Path, text: str, filename: str, cls: dict, flds: dict) -> dict:
    """Decide target folder + file name (relative to the planner root)."""
    t, ext = cls["doc_type"], Path(filename).suffix.lower() or ".pdf"
    sq = squash(text)
    dates = flds.get("dates") or []
    first = dates[0] if dates else None
    today = date.today().isoformat()
    stem = _safe(Path(filename).stem)
    folder, name = "_Inbox", filename
    if t == "de_payslip":
        p = flds.get("period")
        if p:
            y, m = p.split("-")
            name = f"Brutto-Netto-Abrechnung {y} {m} {DE_MONTH_NAMES[int(m) - 1]}{ext}"
        folder = "Finance/germany"
    elif t == "de_lohnsteuerbescheinigung":
        y = flds.get("tax_year") or (re.search(r"20\d{2}", filename) or [today[:4]])[0]
        folder, name = "Finance/germany", f"Lohnsteuerbescheinigung {y}{ext}"
    elif t in ("de_tax_return", "de_tax_assessment"):
        m = re.search(r"\b(20[12]\d)\s+Hauptvordruck", text) or re.search(r"(20[12]\d)", filename)
        y = m.group(1) if m else today[:4]
        kind = "Einkommensteuererklaerung" if t == "de_tax_return" else "Steuerbescheid"
        folder, name = "Finance/germany", f"{kind}_{y}{ext}"
    elif t in ("de_tax_class", "de_social_security", "de_compensation"):
        folder = "Finance/germany"
    elif t == "de_bank_statement":
        folder, name = "Finance/germany/Bank", f"{(first or today)[:7]}_{stem}{ext}"
    elif t == "de_broker":
        folder = "Finance/germany/Investments"
    elif t == "de_insurance":
        folder = "Finance/germany/Insurance"
    elif t == "de_receipt":
        folder, name = f"Finance/germany/Receipts/{(first or today)[:4]}", f"{first or today}_{stem}{ext}"
    elif t == "in_gera_invoice":
        folder = gera_stage_folder(root, gera_stage_from_text(sq), first)
        name = f"Invoice_{flds.get('invoice_no', stem)}{ext}"
    elif t == "in_gera_certificate":
        folder = gera_stage_folder(root, gera_stage_from_text(sq), first)
        name = f"Certificate_{first or today}{ext}"
    elif t in ("in_gera_receipt", "in_bank_ereceipt"):
        amt = flds.get("amount")
        part = "GST" if (amt and amt < 100000) else "Unit"
        pay_date = next((d for d in dates), today)
        folder = gera_stage_folder(root, None, pay_date)
        prefix = "GeraReceipt" if t == "in_gera_receipt" else "BankReceipt"
        name = f"{prefix}_{part}_{int(amt) if amt else 'amount'}_{pay_date}{ext}"
    elif t == "in_tds_statement":
        folder, name = f"{GERA}/4_TDS", f"{flds.get('ack_no', stem)}_Statement{ext}"
    elif t == "in_tds_challan":
        folder, name = f"{GERA}/4_TDS", f"{flds.get('ack_no', stem)}_ChallanReceipt{ext}"
    elif t == "in_tds_bank_advice":
        folder, name = f"{GERA}/4_TDS", f"{flds.get('bank_ref', stem)}_BankAdvice{ext}"
    elif t == "in_gera_soa":
        folder, name = f"{GERA}/2_Statements", f"{flds.get('as_on', today)}_SOA{ext}"
    elif t == "in_gera_interest":
        folder, name = f"{GERA}/2_Statements", f"{flds.get('as_on', today)}_InterestCalcSheet{ext}"
    elif t == "in_gera_agreement":
        folder = f"{GERA}/1_Agreement"
    elif t == "in_bank_statement":
        folder = "Finance/india/Bank/india" if (root / "Finance/india/Bank/india").is_dir() else "Finance/india/Bank"
    elif t == "in_epfo":
        folder = "Finance/india/EPFO"
    elif t == "in_cas":
        folder, name = "Finance/india/Investments", f"{(first or today)[:7]}_CAS{ext}"
    elif t == "in_income_tax":
        ay = flds.get("assessment_year") or today[:4]
        folder = f"Finance/india/Tax/AY {ay}"
    elif t == "career":
        folder = "Carrier"
    return {"folder": folder, "filename": name}


def analyze(root: Path, data: bytes, filename: str) -> dict:
    text, method = extract_text(data, filename)
    cls = classify(text, filename)
    flds = fields(text, filename) if text else {}
    tgt = plan(root, text, filename, cls, flds)
    return {"filename": filename, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "method": method, "has_text": bool(text.strip()), **cls, "fields": flds, **tgt,
            "excerpt": re.sub(r"\s+", " ", text)[:600]}


# ------------------------------------------------------------------ filing
SKIP_PARTS = {"app", "outputs", "_state", "facts", "tools", "_DUPLICATES_TO_DELETE", ".git", "__pycache__"}
DOC_EXT = {".pdf", ".xls", ".xlsx", ".csv", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".txt"}


def safe_target(root: Path, folder: str, filename: str) -> Path:
    base = root.resolve()
    tgt = (base / folder / Path(filename).name).resolve()
    if base not in tgt.parents:
        raise ValueError("Target must be inside your planner folder")
    return tgt


def unique_path(p: Path) -> Path:
    if not p.exists():
        return p
    for i in range(2, 200):
        q = p.with_name(f"{p.stem} ({i}){p.suffix}")
        if not q.exists():
            return q
    raise ValueError("too many files with this name")


def file_bytes(root: Path, data: bytes, folder: str, filename: str) -> Path:
    tgt = unique_path(safe_target(root, folder, filename))
    tgt.parent.mkdir(parents=True, exist_ok=True)
    tgt.write_bytes(data)
    return tgt


def move_existing(root: Path, rel_src: str, folder: str, filename: str) -> Path:
    src = (root / rel_src).resolve()
    if root.resolve() not in src.parents or not src.is_file():
        raise ValueError("Source must be a file inside your planner folder")
    tgt = unique_path(safe_target(root, folder, filename))
    tgt.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(tgt))
    return tgt


def library(root: Path) -> list[dict]:
    out = []
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in DOC_EXT or SKIP_PARTS & set(p.relative_to(root).parts):
            continue
        rel = p.relative_to(root).as_posix()
        st = p.stat()
        out.append({"path": rel, "folder": str(Path(rel).parent.as_posix()), "name": p.name, "size": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")})
    return sorted(out, key=lambda r: r["path"].lower())


def same_place(current_folder: str, suggested_folder: str) -> bool:
    return current_folder.rstrip("/").lower() == suggested_folder.rstrip("/").lower()


# ------------------------------------------------------------------ optional AI fallback
def ai_classify(client, model: str, text: str, filename: str) -> dict | None:
    """Ask Claude to pick one of the rule types when the rules aren't sure. Text only (no images)."""
    if not text.strip():
        return None
    types = {r[0]: r[1] for r in RULES}
    prompt = (f"Classify this personal-finance document for someone living in Germany with finances in India.\n"
              f"File name: {filename}\nAllowed doc_type values: {json.dumps(types)} or 'unknown'.\n"
              f"Reply with JSON only: {{\"doc_type\": ..., \"reason\": short}}\n\nDocument text (excerpt):\n{text[:3500]}")
    try:
        msg = client.messages.create(model=model, max_tokens=200, messages=[{"role": "user", "content": prompt}])
        raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        data = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
        dt = data.get("doc_type")
        rule = next((r for r in RULES if r[0] == dt), None)
        if not rule:
            return None
        return {"doc_type": rule[0], "label": rule[1], "category": rule[2], "country": rule[3], "confidence": 0.7,
                "matched_on": "Claude: " + str(data.get("reason", ""))[:120]}
    except Exception:  # noqa: BLE001
        return None
