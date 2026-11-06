"""Read-only, zero-row checks of the public Supabase history API contract."""
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / "watch/accounts.js").read_text()
url = re.search(r'const SUPABASE_URL = "([^"]+)"', source).group(1)
key = re.search(r'const SUPABASE_ANON_KEY = "([^"]+)"', source).group(1)
tables = {
    "watch_history_preferences": "user_id,enabled",
    "watch_history": "user_id,media_id,media_type,title,poster_path,season,episode,position,duration,updated_at",
}
failed = False
for table, columns in tables.items():
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?select={columns}&limit=0", headers={"apikey": key},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode()
            status = response.status
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read().decode()
    try:
        data = json.loads(body)
    except ValueError:
        data = {"message": body[:300]}
    if status == 200 and data == []:
        print(f"{table}: zero-row read succeeded; no account data queried")
    elif isinstance(data, dict) and data.get("code") == "42501":
        print(f"{table}: exists; anonymous access denied as expected")
    else:
        failed = True
        print(f"{table}: HTTP {status}: {json.dumps(data)}")
if failed:
    raise SystemExit(1)
print("This check does not validate authenticated reads, writes, or per-user RLS.")
