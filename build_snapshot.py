#!/usr/bin/env python3
"""Build daily snapshot JSON for brand-intel-hub."""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
CONTENT_SRC = Path("/workspace/content-angles-radar/data.json")
FOAMFRESH_HTML = Path("/workspace/foamfresh-radar/index.html")
TZ = ZoneInfo("Asia/Kuala_Lumpur")


def today_my() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%d")


def extract_js_literal(html: str, name: str) -> str:
    m = re.search(rf"const\s+{re.escape(name)}\s*=\s*", html)
    if not m:
        raise ValueError(f"const {name} not found")
    i = m.end()
    while i < len(html) and html[i].isspace():
        i += 1
    opener = html[i]
    if opener not in "{[":
        raise ValueError(f"{name}: expected {{ or [, got {opener!r}")
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = None
    escape = False
    j = i
    while j < len(html):
        ch = html[j]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_str:
                in_str = None
        else:
            if ch == '"':
                in_str = ch
            elif ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
                if depth == 0:
                    return html[i : j + 1]
        j += 1
    raise ValueError(f"{name}: unbalanced")


def js_object_to_json(raw: str) -> object:
    """Convert a JS object/array literal (double-quoted strings, unquoted keys) to JSON."""
    # Quote unquoted keys: { key: or , key:
    s = re.sub(r'([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', raw)
    s = re.sub(r"\btrue\b", "true", s)
    s = re.sub(r"\bfalse\b", "false", s)
    s = re.sub(r"\bnull\b", "null", s)
    # strip trailing commas
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    return json.loads(s)


def build_products(biz_date: str) -> dict:
    html = FOAMFRESH_HTML.read_text(encoding="utf-8")
    trends = js_object_to_json(extract_js_literal(html, "TRENDS"))
    products = js_object_to_json(extract_js_literal(html, "PRODUCTS"))
    sample = bool(trends.get("sample")) if isinstance(trends, dict) else True
    if isinstance(products, list) and any(
        isinstance(p, dict) and p.get("sample") for p in products
    ):
        sample = True
    return {
        "biz_date": biz_date,
        "built_at_local": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S %z"),
        "timezone": "Asia/Kuala_Lumpur",
        "sample": sample,
        "source": str(FOAMFRESH_HTML),
        "trends": trends,
        "products": products,
    }


def build_content(biz_date: str) -> dict:
    if not CONTENT_SRC.exists():
        raise FileNotFoundError(CONTENT_SRC)
    data = json.loads(CONTENT_SRC.read_text(encoding="utf-8"))
    data["biz_date"] = biz_date
    data["snapshot_built_at_local"] = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S %z")
    return data


def update_manifest(dates: list[str]) -> None:
    dates = sorted(set(dates), reverse=True)
    manifest = {
        "timezone": "Asia/Kuala_Lumpur",
        "latest": dates[0] if dates else None,
        "dates": dates,
        "updated_at_local": datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S %z"),
    }
    (ROOT / "data" / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=today_my(), help="YYYY-MM-DD (MYT)")
    args = ap.parse_args()
    biz = args.date
    out = ROOT / "data" / biz
    out.mkdir(parents=True, exist_ok=True)

    content = build_content(biz)
    products = build_products(biz)

    (out / "content.json").write_text(
        json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (out / "products.json").write_text(
        json.dumps(products, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    dates = [
        p.name
        for p in (ROOT / "data").iterdir()
        if p.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}", p.name)
    ]
    update_manifest(dates)
    print(f"OK {out}")
    print(f"  content angles: {len(content.get('angles', []))}")
    print(f"  products: {len(products.get('products', []))} sample={products.get('sample')}")
    print(f"  manifest dates: {sorted(dates, reverse=True)}")


if __name__ == "__main__":
    main()
