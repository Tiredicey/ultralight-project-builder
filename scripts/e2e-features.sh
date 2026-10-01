#!/usr/bin/env bash
# E2E for runner 1.2 features against a local site already seeded by e2e-local.sh (owner@example.com, LEARN-626).
# Covers: task sheet, validate mode plan, readiness, runner hello, PDF upload/download round trip, access control.
set -u
B=${BASE:-http://localhost:3000}/api
J='content-type: application/json'
T=$(mktemp -d)
pass=0; fail=0
ok() { if [ "$2" = "1" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  ($3)"; fail=$((fail+1)); fi; }
has() { case "$1" in *"$2"*) echo 1;; *) echo 0;; esac; }
curl -s -c $T/o -H "$J" -d '{"email":"owner@example.com","password":"OwnerPass123!"}' $B/auth/login >/dev/null

r=$(curl -s -b $T/o $B/me/sheet/LEARN-626); ok "task sheet has 14 tasks with how-to-check" $(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if len(d['tasks'])==14 and all(t['how'] for t in d['tasks']) else 0)") "${r:0:100}"
ok "task sheet shows predecessor values" $(has "$r" '"Predecessors":"0040, 0045, 0050, 0060"') "missing"
c=$(curl -s -o /dev/null -w '%{http_code}' $B/me/sheet/LEARN-626); ok "task sheet needs sign-in" $([ "$c" = 401 ] && echo 1 || echo 0) "$c"

# abort any active job on LEARN-626 left by e2e-local, then queue a validate job
for id in $(curl -s -b $T/o $B/jobs | python3 -c "import sys,json;print(' '.join(str(j['id']) for j in json.load(sys.stdin)['jobs'] if j['status'] in ('queued','claimed','running','paused','waiting')))"); do
  curl -s -b $T/o -H "$J" -d '{"type":"abort"}' $B/jobs/$id/commands >/dev/null
  npx wrangler d1 execute ultralight-builder-production --local --command "UPDATE jobs SET status='aborted' WHERE id=$id" >/dev/null 2>&1
done
r=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-626","tasks":[],"mode":"validate"}' $B/jobs); ok "validate job created" $(has "$r" '"id"') "$r"
vid=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
r=$(curl -s -b $T/o $B/jobs/$vid/plan); ok "validate plan is 14 read-only steps" $(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('validate') and len(d['steps'])==14 and all(s['op']=='validate' for s in d['steps']) else 0)") "${r:0:120}"
r=$(curl -s -b $T/o -H "$J" -d '{"type":"click","x":1,"y":1}' $B/jobs/$vid/commands); ok "validate job refuses canvas input" $(has "$r" 'read-only') "$r"

tok=$(curl -s -b $T/o -H "$J" -d '{"name":"e2e-12","accounts":[]}' $B/admin/runners | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
r=$(curl -s -H "$J" -H "authorization: Bearer $tok" -H 'x-runner-version: 1.2.0' -d '{"info":{"version":"1.2.0","host":"e2e-host","platform":"linux/arm64","accounts":["LEARN-626"],"accountsWithPassword":["LEARN-626"],"sap":{"ok":true,"status":200,"ms":90},"sapHost":"m53p.ucc.cloud"}}' $B/runner/hello)
ok "runner hello returns latest version" $(has "$r" '"latest":"1.3.4"') "$r"
r=$(curl -s -H "$J" -H "authorization: Bearer ucr_nope" -d '{}' $B/runner/hello); ok "hello with bad token refused" $(has "$r" 'invalid') "$r"
r=$(curl -s -H "$J" -H "authorization: Bearer $tok" -d '{"accounts":["LEARN-626"]}' $B/runner/claim); ok "runner claims validate job with validate plan" $(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('job',{}).get('mode')=='validate' and d['plan']['steps'][0]['op']=='validate' else 0)") "${r:0:160}"
# report two task results and finish
curl -s -H "$J" -H "authorization: Bearer $tok" -d '{"status":"done","stepIdx":14,"result":{"ok":1,"failed":1,"summary":"1 of 14 tasks pass in SAP, 1 not complete"},"events":[{"level":"ok","stepKey":"1.v","message":"Task 1 verified in SAP"},{"level":"error","stepKey":"13.v","message":"Task 13 not complete in SAP: FAIL invoice"}]}' $B/runner/jobs/$vid/state >/dev/null
r=$(curl -s -b $T/o $B/me/readiness)
ok "readiness shows runner host from hello" $(has "$r" '"host":"e2e-host"') "${r:0:160}"
ok "readiness shows per-task validation" $(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);a=[x for x in d['accounts'] if x['sapUser']=='LEARN-626'][0];t=a['validation']['tasks'];print(1 if t['1']['level']=='ok' and t['13']['level']=='error' else 0)") "${r:0:200}"
ok "readiness knows runner holds password" $(has "$r" '"holdsPassword":true') "no"

# PDF round trip: 2.5 MB file -> 3 chunks
python3 -c "import os;open('$T/t.pdf','wb').write(b'%PDF-1.4\n'+os.urandom(2_500_000)+b'\n%%EOF\n')"
size=$(stat -c %s $T/t.pdf)
r=$(curl -s -b $T/o -H "$J" -d "{\"name\":\"tasks.pdf\",\"size\":$size}" $B/admin/docs); ok "doc created" $(has "$r" '"chunks":') "$r"
did=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"); n=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['chunks'])"); cs=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['chunkSize'])")
base64 -w0 $T/t.pdf > $T/t.b64
for i in $(seq 0 $((n-1))); do dd if=$T/t.b64 bs=$cs skip=$i count=1 status=none > $T/c$i; curl -s -b $T/o -X PUT -H 'content-type: text/plain' --data-binary @$T/c$i $B/admin/docs/$did/$i > $T/r$i; done
ok "all $n chunks accepted, doc complete" $(has "$(cat $T/r$((n-1)))" '"complete":true') "$(cat $T/r$((n-1)))"
curl -s -b $T/o -H "$J" -d '{"taskPages":{"1":2,"13":9,"99":4}}' $B/admin/docs/$did >/dev/null
r=$(curl -s -b $T/o $B/me/docs); ok "page map saved, out-of-range task dropped" $(has "$r" '"task_pages":{"1":2,"13":9}') "$r"
: > $T/back.b64; for i in $(seq 0 $((n-1))); do curl -s -b $T/o $B/me/docs/$did/$i >> $T/back.b64; done
base64 -d $T/back.b64 > $T/back.pdf 2>/dev/null
ok "PDF downloads byte-identical" $(cmp -s $T/t.pdf $T/back.pdf && echo 1 || echo 0) "$(stat -c %s $T/back.pdf) vs $size bytes"
r=$(curl -s -b $T/o -H "$J" -d '{"name":"x.pdf","size":1000}' $B/admin/docs); xid=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
r=$(curl -s -b $T/o -X PUT -H 'content-type: text/plain' --data-binary "$(printf 'hello world not a pdf' | base64 -w0)" $B/admin/docs/$xid/0); ok "non-PDF bytes rejected" $(has "$r" 'not a PDF') "$r"
r=$(curl -s -b $T/o -H "$J" -d '{"name":"big.pdf","size":30000000}' $B/admin/docs); ok "over 20 MB rejected" $(has "$r" '20 MB') "$r"

# a plain approved user can read the sheet and docs but not upload
curl -s -c $T/u -H "$J" -d '{"email":"reader@example.com","name":"Reader","password":"ReaderPass123!"}' $B/auth/register >/dev/null
uid=$(npx wrangler d1 execute ultralight-builder-production --local --json --command "SELECT id FROM users WHERE email='reader@example.com'" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['id'])")
curl -s -b $T/o -H "$J" -d '{"status":"approved"}' $B/admin/users/$uid >/dev/null
curl -s -c $T/u -H "$J" -d '{"email":"reader@example.com","password":"ReaderPass123!"}' $B/auth/login >/dev/null
c=$(curl -s -o /dev/null -w '%{http_code}' -b $T/u $B/me/docs/$did/0); ok "approved user can download the PDF" $([ "$c" = 200 ] && echo 1 || echo 0) "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' -b $T/u -H "$J" -d '{"name":"a.pdf","size":10}' $B/admin/docs); ok "user cannot upload" $([ "$c" = 403 ] && echo 1 || echo 0) "$c"
r=$(curl -s -b $T/u $B/me/readiness); ok "user readiness hides runner host details" $([ "$(has "$r" 'e2e-host')" = 0 ] && echo 1 || echo 0) "${r:0:160}"
c=$(curl -s -o /dev/null -w '%{http_code}' ${B%/api}/static/demo.mp4 -r 0-99); ok "demo video served" $([ "$c" = 206 ] || [ "$c" = 200 ] && echo 1 || echo 0) "$c"
echo "$pass passed, $fail failed"
