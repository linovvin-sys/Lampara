"""
Lampara end-to-end checks. Drives the real pages in Microsoft Edge at phone size, with a simulated GPS position, a fake camera
and granted sensor permissions. It needs the site running on http://localhost/Lampara/ (XAMPP) and its local database.

    pip install playwright          (uses the Edge that Windows already has; no browser download)
    python tests/e2e/run.py         every suite
    python tests/e2e/run.py fence   one suite (fence, journey, outside, camera, map, reports, admin, security, smoke)

It adds a few rows to the local database (reports, a temporary admin account) and removes them again, even when a check fails.
It cannot test real GPS drift, a real compass, step counting, or Safari on an iPhone: those need a person with a phone.
"""
import base64, json, os, secrets, subprocess, sys, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BASE = 'http://localhost/Lampara/Frontend/View/'
API = 'http://localhost/Lampara/Backend/api/'
SHOTS = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(SHOTS, exist_ok=True)
CAMPUS = {'latitude': 14.32775, 'longitude': 120.94117, 'accuracy': 10}      # inside the campus area
BESIDE_MAIN = {'latitude': 14.32728, 'longitude': 120.94062, 'accuracy': 8}   # next to the Main building
MANILA = {'latitude': 14.5995, 'longitude': 120.9842, 'accuracy': 10}
PERMS = ['geolocation', 'camera', 'accelerometer', 'gyroscope', 'magnetometer']
QUIET = 'localStorage.setItem("lampara_privacy_ok","1"); localStorage.setItem("lampara_tutorial_done","1");'
results = []


def rec(name, ok, note=''):
    results.append((name, bool(ok), note))
    print(('  PASS ' if ok else '  FAIL ') + name + (' - ' + str(note) if note else ''), flush=True)


def php(code):
    return subprocess.run(['php', '-r', code], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def sql(query):
    return php("require 'Backend/config.php'; $c=(new Database())->connect(); $r=$c->query(%s); if($r instanceof mysqli_result){ $o=[]; while($x=$r->fetch_row()) $o[]=$x; echo json_encode($o);}" % json.dumps(query))


def reset_throttles():
    php("foreach(['::1','127.0.0.1'] as $ip) foreach(['hazard_report_ip','login'] as $b) @unlink(sys_get_temp_dir().DIRECTORY_SEPARATOR.'lampara_rl_'.md5($b.'|'.$ip).'.json');")


def api(path, data=None, method=None, headers=None):
    req = urllib.request.Request(API + path, json.dumps(data).encode() if data is not None else None, dict({'Content-Type': 'application/json'}, **(headers or {})), method=method)
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or '{}')


class Browser:
    def __init__(self, p):
        self.b = p.chromium.launch(channel='msedge', headless=True, args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])

    def page(self, geo=CAMPUS, quiet=True, reduced=False, perms=PERMS):
        c = self.b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, is_mobile=True, has_touch=True,
                               geolocation=geo, permissions=list(perms) if geo else [], reduced_motion='reduce' if reduced else 'no-preference')
        pg = c.new_page()
        pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(str(e)))
        pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        if quiet:
            pg.add_init_script(QUIET)
        return c, pg


# --------------------------------------------------------------------------------------------------------------- suites
def suite_fence(B):
    c, pg = B.page(MANILA); pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(2500)
    rec('a visitor in Manila is stopped on a live-guidance page', 'not on the campus' in (pg.inner_text('.lf') if pg.query_selector('.lf') else '').lower())
    c.close()
    c, pg = B.page(MANILA)
    ok = True
    for u in ['Student/where.php', 'Student/manual-search.php', 'Public/map.php', 'Public/index.php']:
        pg.goto(BASE + u); pg.wait_for_timeout(1500); ok = ok and pg.query_selector('.lf') is None
    rec('directory, map, start page and home stay open to everyone', ok)
    c.close()
    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(2500)
    rec('a visitor on campus gets in', pg.query_selector('.lf') is None and pg.is_visible('#s1'))
    c.close()
    c, pg = B.page(None); pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(3500)
    t = pg.inner_text('.lf') if pg.query_selector('.lf') else ''
    rec('location switched off shows "turn on your location"', 'location' in t.lower())
    c.close()
    c, pg = B.page(CAMPUS)
    pg.add_init_script('navigator.geolocation.getCurrentPosition = (ok, err) => err({ code: 2, message: "unavailable" });')
    pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(2500)
    rec('no location fix (a desktop) offers "I am on the campus"', pg.query_selector('#lfHere') is not None)
    if pg.query_selector('#lfHere'):
        pg.click('#lfHere'); pg.wait_for_timeout(600)
        rec('confirming releases the page', pg.query_selector('.lf') is None)
    c.close()
    # admin switch off lets Manila in; restore afterwards
    sql("INSERT INTO app_settings (k,v) VALUES ('campus_fence','0') ON DUPLICATE KEY UPDATE v='0'")
    try:
        c, pg = B.page(MANILA); pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(2500)
        rec('with the admin switch off, nobody is blocked', pg.query_selector('.lf') is None)
        c.close()
    finally:
        sql("DELETE FROM app_settings WHERE k='campus_fence'")


def suite_journey(B):
    c, pg = B.page(CAMPUS)
    pg.goto(BASE + 'Student/journey.php?from=9&to=78'); pg.wait_for_timeout(1500)
    rec('step 1 loads: walk to the exit', pg.inner_text('#title').startswith('Walk to the exit'), pg.inner_text('#title'))
    steps = pg.eval_on_selector_all('#textSteps li', 'e => e.map(x => x.innerText)')
    rec('directions in words are listed', len(steps) >= 2 and 'arrive' in steps[-1].lower(), ' | '.join(steps)[:110])
    rec('the floor-plan canvas has a text alternative', 'Floor plan' in (pg.get_attribute('#cv', 'aria-label') or ''))
    cache = pg.evaluate('localStorage.getItem("lampara_doors_cache")') or ''
    rec('door points come from the database (and are kept for offline)', '"entry"' in cache and 'Point AG' in cache)
    rec('the exit is not marked as a guess', 'estimated' not in pg.inner_text('#hudR').lower(), pg.inner_text('#hudR'))
    pg.wait_for_selector('#card.on', timeout=15000)
    rec('step 1 ends with the "at the exit" card', 'exit' in pg.inner_text('#cardTitle').lower())
    pg.screenshot(path=os.path.join(SHOTS, 'journey-exit.png'))
    pg.click('#cardGo'); pg.wait_for_timeout(800)
    rec('step 2: the outside screen, with distance', not pg.is_hidden('#viewOut') and 'meters' in pg.inner_text('#outMeta'), pg.inner_text('#outMeta'))
    rec('the text directions are hidden outside', pg.is_hidden('#viewText'))
    href = pg.get_attribute('#outOpen', 'href')
    rec('"Open the walking guide" targets the room', 'guide-ar.php?to=' in href and 'room=78' in href, href)
    pg.click('#outDone'); pg.wait_for_timeout(1000)
    rec('step 3 starts on the Annex 2nd floor', '2nd Floor' in pg.inner_text('#hudL'), pg.inner_text('#hudL'))
    pg.wait_for_selector('#card.on', timeout=20000)
    rec('stairs card, then the 3rd floor', 'stairs' in pg.inner_text('#cardTitle').lower())
    pg.click('#cardGo'); pg.wait_for_timeout(1200)
    rec('3rd floor shows its own directions', '3rd Floor' in pg.inner_text('#hudL') and '3rd Floor' in pg.inner_text('#textTitle'))
    pg.wait_for_selector('#card.on', timeout=20000)
    rec('route ends with "You have arrived"', 'arrived' in pg.inner_text('#cardTitle').lower())
    rec('no script errors on the route page', not pg.errors, '; '.join(pg.errors)[:150])
    c.close()

    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/journey.php?from=9&to=78'); pg.wait_for_timeout(1200)
    pg.wait_for_selector('#card.on', timeout=15000); pg.click('#cardGo'); pg.wait_for_timeout(600)
    pg.goto(BASE + 'Student/journey.php?from=9&to=78'); pg.wait_for_timeout(1500)
    rec('a reload resumes at the outside step', 'Walk outside' in pg.inner_text('#title'))
    pg.goto(BASE + 'Student/where.php'); pg.wait_for_timeout(1500)
    rec('the start page offers "Continue my trip"', pg.is_visible('#resume'))
    c.close()

    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/journey.php?from=9&to=11'); pg.wait_for_selector('#card.on', timeout=15000)
    rec('a same-building route draws and ends', 'arrived' in pg.inner_text('#cardTitle').lower(), pg.inner_text('#hudR'))
    c.close()

    c, pg = B.page(CAMPUS, reduced=True); pg.goto(BASE + 'Student/journey.php?from=9&to=11'); pg.wait_for_timeout(1900)
    rec('reduced motion: the route is shown finished straight away', pg.query_selector('#card.on') is not None)
    c.close()

    c, pg = B.page(CAMPUS)
    pg.add_init_script('window.__shared = null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };')
    pg.goto(BASE + 'Student/journey.php?from=9&to=11'); pg.wait_for_timeout(1500); pg.click('#share'); pg.wait_for_timeout(600)
    rec('"Share this route" opens the share sheet with the link', 'journey.php?from=9&to=11' in str((pg.evaluate('window.__shared') or {}).get('url')))
    c.close()
    c, pg = B.page(CAMPUS); c.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg.add_init_script('navigator.share = undefined;')
    pg.goto(BASE + 'Student/journey.php?from=9&to=11'); pg.wait_for_timeout(1500); pg.click('#share'); pg.wait_for_timeout(800)
    rec('...and without one the link is copied', 'journey.php?from=9&to=11' in pg.evaluate('navigator.clipboard.readText()') and not pg.is_hidden('#toast'))
    c.close()

    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/journey.php?to=99999'); pg.wait_for_timeout(1500)
    rec('a bad link shows a friendly error with a way out', pg.is_visible('#error') and pg.is_visible('#errorLinks'))
    c.close()

    c, pg = B.page(CAMPUS, quiet=False); pg.goto(BASE + 'Student/where.php'); pg.wait_for_timeout(1500)
    rec('first visit shows the privacy notice', pg.query_selector('[aria-label="Privacy notice"]') is not None)
    pg.click('[aria-label="Privacy notice"] button'); pg.goto(BASE + 'Student/where.php'); pg.wait_for_timeout(1000)
    rec('"OK" is remembered', pg.query_selector('[aria-label="Privacy notice"]') is None)
    pg.goto(BASE + 'Student/privacy.php'); rec('the privacy page loads', 'How Lampara uses your phone' in pg.inner_text('h1'))
    c.close()

    c, pg = B.page(CAMPUS)
    pg.goto(BASE + 'Student/where.php'); pg.click('[data-where="inside"]'); pg.wait_for_timeout(1500)
    rec('"inside" opens the room scan page', 'scan.php' in pg.url)
    pg.goto(BASE + 'Student/scan.php?room=78'); pg.wait_for_timeout(2500)
    txt = pg.inner_text('body')
    rec('"Where are you now?" offers the door and hides "still outside"', 'I am at the door of' in txt and 'I am still outside' not in txt)
    c.close()


def suite_outside(B):
    c, pg = B.page(BESIDE_MAIN)
    pg.goto(BASE + 'Public/guide-ar.php?to=3&room=78'); pg.wait_for_timeout(4000)
    pg.click('text=/Start navigation to/'); pg.wait_for_timeout(8000)
    st = pg.evaluate('(() => { const E = window.LamparaLocar; return { ready: E.ready, chevrons: E._route ? E._route.chevrons.length : 0, remaining: E.routeRemaining() }; })()')
    rec('the walking guide starts and lays the route', st['ready'] and st['chevrons'] > 5, str(st))
    sb = pg.query_selector('.scan-btn')
    rec('while walking, the bottom button (when shown) is the small "I am inside"', sb is None or 'I am inside' in sb.inner_text())
    for la, ln in [(14.32754, 120.94048), (14.327562, 120.94048)]:
        c.set_geolocation({'latitude': la, 'longitude': ln, 'accuracy': 6}); pg.wait_for_timeout(4500)
    rec('walking to the door shows "You\'ve arrived"', "You've arrived" in pg.inner_text('body'))
    btn = pg.query_selector('.nav-inside')
    rec('the arrival card carries a large "Go inside" button', btn is not None and 'Go inside' in btn.inner_text(), (btn.inner_text().replace('\n', ' / ') if btn else ''))
    rec('the small bottom button is gone once arrived', pg.query_selector('.scan-btn') is None)
    if btn:
        rec('it opens the floor plan from the entrance', 'journey.php?arrived=1&to=78' in btn.get_attribute('href'))
        btn.click(); pg.wait_for_timeout(3000)
        rec('and that page shows the route to the room', 'Walk to 2312' in pg.inner_text('#title'), pg.inner_text('#title'))
    c.close()


def suite_camera(B):
    c, pg = B.page(CAMPUS)
    pg.goto(BASE + 'Student/indoor-ar.php?from=9&to=78'); pg.wait_for_timeout(2500)
    rec('the camera guide loads the leave-building route', 'Walk to the exit' in pg.inner_text('h1'))
    if 'Scan QR' in pg.inner_text('.ia-btn-green'): pg.click('text=Skip'); pg.wait_for_timeout(400)
    pg.click('.ia-btn-green'); pg.wait_for_timeout(6000)
    st = pg.evaluate('(() => { const E = window.LamparaLocarIndoor; return E ? { ready: E.ready, chev: E._chev.filter(c => c.obj.visible).length, marker: !!E._marker } : null; })()')
    rec('it starts with a ribbon and the exit pin', st and st['ready'] and st['chev'] > 3 and st['marker'], str(st))
    for _ in range(30):
        if pg.query_selector('a.ia-btn-green'): break
        pg.click('text=+2 m'); pg.wait_for_timeout(150)
    pg.wait_for_timeout(1000)
    rec('the route end says "You are at the exit"', 'exit' in pg.inner_text('.ia-banner-title').lower())
    link = pg.query_selector('a.ia-btn-green')
    rec('"Continue outside" opens the walking guide for the room', link and 'guide-ar.php?to=3&room=78' in link.get_attribute('href'))
    rec('the trip is saved at the exit', '"step":1' in (pg.evaluate('localStorage.getItem("lampara_trip")') or ''))
    rec('no script errors in the camera guide', not [e for e in pg.errors if 'Delay' not in e], '; '.join(pg.errors)[:150])
    c.close()
    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/indoor-ar.php?arrived=1&to=78'); pg.wait_for_timeout(2500)
    rec('uncalibrated floors give a clear message and a floor-plan way out', 'calibrat' in pg.inner_text('body').lower() and pg.query_selector('text=Show the floor plan instead'))
    c.close()
    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/indoor-ar.php?from=9&to=11'); pg.wait_for_timeout(2500)
    rec('a same-building camera route loads', 'Walk to' in pg.inner_text('h1'))
    c.close()


def suite_map(B):
    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Public/map.php'); pg.wait_for_timeout(2000); pg.click('#tab-street'); pg.wait_for_timeout(2500)
    info = pg.evaluate('({ line: document.querySelectorAll(".campus-limit").length, mask: document.querySelectorAll(".campus-mask").length, pins: document.querySelectorAll(".st-pin, .leaflet-marker-icon").length, tiles: document.querySelectorAll(".leaflet-tile").length })')
    rec('satellite map: white line, grey outside, no pins, tiles', info['line'] >= 2 and info['mask'] >= 1 and info['pins'] == 0 and info['tiles'] > 0, str(info))
    pg.screenshot(path=os.path.join(SHOTS, 'map-satellite.png'))
    c.close()


def suite_reports(B):
    reset_throttles()
    c, pg = B.page(CAMPUS)
    pg.goto(BASE + 'Student/report.php'); pg.wait_for_timeout(1500)
    pg.click('[data-kind="restricted"]'); pg.wait_for_timeout(2500)
    rec('the live camera opens', pg.evaluate('!!document.getElementById("video").srcObject'))
    rec('the page asks to keep faces out of the photo', 'faces' in pg.inner_text('#s2').lower())
    pg.click('#snap'); pg.wait_for_timeout(800); pg.click('#toDetails'); pg.wait_for_timeout(2500)
    rec('the nearest building is picked from the position', 'near' in pg.inner_text('#loc').lower(), pg.inner_text('#loc'))
    pg.fill('#note', 'e2e normal'); pg.click('#send'); pg.wait_for_selector('#s4:not([hidden])', timeout=8000)
    row = json.loads(sql("SELECT status, urgent FROM hazard_reports WHERE note='e2e normal'") or '[]')
    rec('a normal report is stored as waiting for approval', row and row[0][0] == 'pending' and row[0][1] in (0, '0'), str(row))
    c.close()

    c, pg = B.page(CAMPUS)
    pg.goto(BASE + 'Student/report.php'); pg.click('[data-kind="blocked"]'); pg.wait_for_timeout(2000); pg.click('#skipPhoto'); pg.wait_for_timeout(2500)
    pg.check('#urgent'); pg.fill('#note', 'e2e urgent'); pg.click('#send'); pg.wait_for_selector('#s4:not([hidden])', timeout=8000)
    rec('an urgent report says it is showing now', 'showing to everyone' in pg.inner_text('#s4').lower())
    pub = api('hazards.php')['reports']
    mine = [r for r in pub if r['note'] == 'e2e urgent']
    rec('visitors see the urgent one, marked unchecked, and not the normal one', mine and mine[0]['urgent'] and not mine[0]['verified'] and all(r['note'] != 'e2e normal' for r in pub))
    c.close()

    c, pg = B.page(CAMPUS); pg.goto(BASE + 'Student/where.php'); pg.wait_for_timeout(3500)
    bar = pg.query_selector('.lh-bar.on')
    rec('the red banner shows "not yet checked by staff"', bar and 'not yet checked' in bar.inner_text().lower(), bar.inner_text().replace('\n', ' ') if bar else '')
    pg.screenshot(path=os.path.join(SHOTS, 'banner-urgent.png'))
    if bar:
        pg.click('.lh-main'); pg.wait_for_timeout(600)
        rec('the sheet lists it', 'e2e urgent' in pg.inner_text('.lh-sheet'))
    c.close()

    # a photo sent by hand with location data in it comes back clean
    exif = b'Exif\x00\x00GPSLatitude=14.3273 SECRET-LOCATION'
    jpeg = bytearray(base64.b64decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z'))
    data = bytes(jpeg[:2]) + b'\xff\xe1' + (len(exif) + 2).to_bytes(2, 'big') + exif + bytes(jpeg[2:])
    r = api('hazards.php', {'kind': 'restricted', 'building_id': 1, 'note': 'e2e exif', 'image': 'data:image/jpeg;base64,' + base64.b64encode(data).decode()}, headers={'Cookie': 'lampara_dev=' + secrets.token_hex(8)})
    path = (json.loads(sql("SELECT photo_path FROM hazard_reports WHERE note='e2e exif'") or '[[null]]')[0][0]) or ''
    saved = open(os.path.join(ROOT, 'Frontend', path), 'rb').read() if path else b''
    rec('photo location data is removed on the server', r.get('success') and saved[:2] == b'\xff\xd8' and b'SECRET-LOCATION' not in saved)

    ident = json.loads(sql("SELECT id FROM hazard_reports WHERE note='e2e urgent'"))[0][0]
    for _ in range(3): api('hazards.php?id=%s&action=flag' % ident, {}, method='POST', headers={'Cookie': 'lampara_dev=' + secrets.token_hex(8)})
    rec('three "report this photo" notices take it off everyone\'s screen', all(r['note'] != 'e2e urgent' for r in api('hazards.php')['reports']))

    # two phones behind one address do not share the same allowance
    reset_throttles()
    codes = []
    DEVS = [secrets.token_hex(8), secrets.token_hex(8)]
    for dev in DEVS:
        for _ in range(5): codes.append(api('hazards.php', {'kind': 'blocked', 'building_id': 1, 'note': 'e2e dev'}, headers={'Cookie': 'lampara_dev=' + dev}).get('success'))
    rec('each device gets its own allowance on a shared network', all(codes[:5]) and all(codes[5:]))
    rec('...and the sixth from one device is refused', api('hazards.php', {'kind': 'blocked', 'building_id': 1, 'note': 'e2e dev'}, headers={'Cookie': 'lampara_dev=' + DEVS[0]}).get('success') is not True)

    for row in json.loads(sql("SELECT photo_path FROM hazard_reports WHERE note LIKE 'e2e%'") or '[]'):
        if row[0]:
            try: os.remove(os.path.join(ROOT, 'Frontend', row[0]))
            except OSError: pass
    sql("DELETE FROM hazard_reports WHERE note LIKE 'e2e%'")
    reset_throttles()


def suite_admin(B):
    reset_throttles()
    user, pw = 'qa_tmp_admin', 'QaTmp-%d!' % os.getpid()
    php("require 'Backend/config.php'; $c=(new Database())->connect(); $h=password_hash(%s, PASSWORD_DEFAULT); $s=$c->prepare('INSERT INTO admins (username,password_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)'); $u=%s; $s->bind_param('ss',$u,$h); $s->execute();" % (json.dumps(pw), json.dumps(user)))
    saved_doors = sql("SELECT building_id, kind, node_id FROM building_doors")
    try:
        c, pg = B.page(CAMPUS)
        pg.goto(BASE + 'Admin/login.php'); pg.wait_for_timeout(1500)
        pg.fill('#loginUsername', user); pg.fill('#loginPassword', pw); pg.click('.btn-submit'); pg.wait_for_timeout(3500)
        rec('admin can sign in', 'login.php' not in pg.url, pg.url.split('/')[-1])
        cookies = [x for x in c.cookies() if x['name'].startswith('PHPSESSID')]
        rec('the session cookie is HttpOnly and SameSite', cookies and cookies[0]['httpOnly'] and cookies[0]['sameSite'] in ('Lax', 'Strict'), str(cookies[0]['sameSite']) if cookies else '')
        pg.goto(BASE + 'Admin/dashboard.php'); pg.wait_for_timeout(3000)
        rec('the dashboard loads without script errors', not pg.errors, '; '.join(pg.errors)[:150])

        # reports: approve a waiting one, confirm an urgent one
        reset_throttles()
        api('hazards.php', {'kind': 'blocked', 'building_id': 1, 'note': 'e2e admin wait'}, headers={'Cookie': 'lampara_dev=' + secrets.token_hex(8)})
        api('hazards.php', {'kind': 'restricted', 'urgent': True, 'building_id': 1, 'note': 'e2e admin urgent'}, headers={'Cookie': 'lampara_dev=' + secrets.token_hex(8)})
        pg.goto(BASE + 'Admin/hazards.php'); pg.wait_for_timeout(3000)
        txt = pg.inner_text('#hzList')
        rec('the Reports page lists the waiting and the urgent report', 'Approve' in txt and 'Confirm it is real' in txt and 'Urgent' in txt)
        pg.click('[data-id] [data-act="approve"]'); pg.wait_for_selector('.swal2-popup', timeout=5000)
        rec('approving asks first in a SweetAlert dialog', 'Show this to everyone' in pg.inner_text('.swal2-popup'))
        pg.click('.swal2-confirm'); pg.wait_for_timeout(2000)
        st = json.loads(sql("SELECT status, verified FROM hazard_reports WHERE note='e2e admin wait'"))[0]
        rec('after confirming, the report is live and verified', st[0] == 'active' and st[1] in (1, '1'), str(st))
        pg.click('.hz-tab[data-status="pending"]'); pg.wait_for_timeout(1500)
        pg.click('[data-act="verify"]'); pg.wait_for_selector('.swal2-popup', timeout=5000); pg.click('.swal2-confirm'); pg.wait_for_timeout(2000)
        st = json.loads(sql("SELECT verified FROM hazard_reports WHERE note='e2e admin urgent'"))[0]
        rec('"Confirm it is real" verifies the urgent report', st[0] in (1, '1'))
        pg.screenshot(path=os.path.join(SHOTS, 'admin-reports.png'))

        # the campus-only switch
        pg.goto(BASE + 'Admin/campus-paths.php'); pg.wait_for_timeout(3500)
        rec('the campus-only switch shows its state', 'ON' in pg.inner_text('#ftState'), pg.inner_text('#ftState'))
        pg.click('#ftBtn'); pg.wait_for_selector('.swal2-popup', timeout=5000); pg.click('.swal2-confirm'); pg.wait_for_timeout(2000)
        off = api('fence.php')['enabled'] is False
        pg.click('#ftBtn'); pg.wait_for_selector('.swal2-popup', timeout=5000); pg.click('.swal2-confirm'); pg.wait_for_timeout(2000)
        rec('switching off and on again works and is saved', off and api('fence.php')['enabled'] is True)

        # doors
        pg.goto(BASE + 'Admin/doors.php?building=1'); pg.wait_for_timeout(3000)
        e, x = pg.eval_on_selector('#drEntry', 'e => e.options[e.selectedIndex].text'), pg.eval_on_selector('#drExit', 'e => e.options[e.selectedIndex].text')
        rec('the Doors page shows Main\'s saved entrance and exit', e == 'Point AG' and x == 'Point B', e + ' / ' + x)
        pg.select_option('#drExit', label='Point A'); pg.click('#drSave'); pg.wait_for_timeout(2500)
        door = api('building-doors.php?building_id=1')['doors']['1']['exit']['name']
        rec('saving a door changes it', door == 'Point A', door)
        h = pg.evaluate("fetch('../../../Backend/api/setup-health.php', { credentials: 'same-origin' }).then(r => r.json())")
        steps = [st['key'] for b in h.get('buildings', []) for st in b['steps']]
        rec('the setup checklist has a "Mark the doors" step for every building', h.get('success') and steps.count('doors') == len(h['buildings']) and len(steps) > 0, '%d buildings' % len(h.get('buildings', [])))
        c.close()
    finally:
        sql("DELETE FROM admins WHERE username='%s'" % user)
        for b, k, n in json.loads(saved_doors or '[]'):
            sql("INSERT INTO building_doors (building_id, kind, node_id) VALUES (%s,'%s',%s) ON DUPLICATE KEY UPDATE node_id=VALUES(node_id)" % (b, k, n))
        sql("DELETE FROM hazard_reports WHERE note LIKE 'e2e%'")
        sql("DELETE FROM app_settings WHERE k='campus_fence'")
        reset_throttles()


def suite_security(B):
    r = api('admin_login.php', {'username': 'x', 'password': 'y'}, headers={'Origin': 'http://evil.example'})
    rec('a login sent from another website is refused', 'did not come from this site' in str(r.get('error')), str(r.get('error')))
    reset_throttles()
    r = api('hazards.php?id=1&action=approve', {}, method='PUT', headers={'Origin': 'http://evil.example'})
    rec('an admin write from another website is refused', r.get('success') is not True)
    ok = True
    for u in ['Backend/schema.sql', 'docs/ar-navigation-setup.md', 'Backend/config.php', 'Backend/scripts/create-admin.php']:
        try: urllib.request.urlopen('http://localhost/Lampara/' + u); ok = False
        except urllib.error.HTTPError as e: ok = ok and e.code == 404
    rec('project internals are not downloadable', ok)
    r = urllib.request.urlopen(API + 'rooms.php')
    rec('API answers carry the safe headers and no open cross-origin setting', r.headers.get('X-Content-Type-Options') == 'nosniff' and not r.headers.get('Access-Control-Allow-Origin'))
    p = os.path.join(ROOT, 'Frontend', 'assets', 'photos', 'zz-e2e.php')
    open(p, 'w').write('<?php echo "RAN";')
    try: urllib.request.urlopen('http://localhost/Lampara/Frontend/assets/photos/zz-e2e.php'); ran = True
    except urllib.error.HTTPError: ran = False
    os.remove(p)
    rec('a script dropped into the photos folder does not run', not ran)


def suite_smoke(B):
    """Every page opens without an uncaught script error, and every read API answers. Nothing here changes data."""
    public = ['Public/index.php', 'Public/map.php', 'Public/guide-ar.php', 'Student/where.php', 'Student/manual-search.php', 'Student/scan.php',
              'Student/report.php', 'Student/privacy.php', 'Student/journey.php?from=9&to=78', 'Student/indoor-ar.php?from=9&to=11']
    for u in public:
        c, pg = B.page(CAMPUS)
        uncaught = []
        pg.on('pageerror', lambda e: uncaught.append(str(e)))
        pg.goto(BASE + u); pg.wait_for_timeout(2500)
        rec('page opens: ' + u.split('?')[0], not uncaught and pg.query_selector('.lf') is None, '; '.join(uncaught)[:120])
        c.close()
    for ep in ['rooms.php', 'buildings.php', 'floor-plans.php?building_id=1', 'floor-plan-graph.php?building_id=1', 'campus-graph.php', 'campus-footprints.php',
               'static-maps.php', 'static-map-markers.php?kind=2d', 'building-doors.php', 'hazards.php', 'fence.php', 'ping.php']:
        try:
            r = urllib.request.urlopen(API + ep); body = json.loads(r.read().decode())
            rec('API answers: ' + ep.split('?')[0], r.status == 200 and body.get('success', True) is not False, '')
        except Exception as e:
            rec('API answers: ' + ep.split('?')[0], False, str(e)[:100])
    user, pw = 'qa_tmp_admin', 'QaTmp-%d!' % os.getpid()
    reset_throttles()
    php("require 'Backend/config.php'; $c=(new Database())->connect(); $h=password_hash(%s, PASSWORD_DEFAULT); $s=$c->prepare('INSERT INTO admins (username,password_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)'); $u=%s; $s->bind_param('ss',$u,$h); $s->execute();" % (json.dumps(pw), json.dumps(user)))
    try:
        c, pg = B.page(CAMPUS)
        pg.goto(BASE + 'Admin/login.php'); pg.wait_for_timeout(1200); pg.fill('#loginUsername', user); pg.fill('#loginPassword', pw); pg.click('.btn-submit'); pg.wait_for_timeout(3000)
        for u in ['dashboard.php', 'buildings.php', 'building-edit.php', 'room-edit.php', 'floor-calibration.php', 'campus-paths.php', 'building-outlines.php',
                  'campus-map.php', 'doors.php', 'hazards.php', 'test-chat.php']:
            uncaught = []
            pg.on('pageerror', lambda e: uncaught.append(str(e)))
            pg.goto(BASE + 'Admin/' + u); pg.wait_for_timeout(2500)
            rec('admin page opens: ' + u, 'login.php' not in pg.url and not uncaught, '; '.join(uncaught)[:120])
            pg.remove_listener('pageerror', pg.listeners('pageerror')[-1]) if hasattr(pg, 'listeners') else None
        c.close()
    finally:
        sql("DELETE FROM admins WHERE username='%s'" % user)
        reset_throttles()


SUITES = {'fence': suite_fence, 'journey': suite_journey, 'outside': suite_outside, 'camera': suite_camera, 'map': suite_map,
          'reports': suite_reports, 'admin': suite_admin, 'security': suite_security, 'smoke': suite_smoke}

if __name__ == '__main__':
    wanted = sys.argv[1:] or list(SUITES)
    with sync_playwright() as p:
        B = Browser(p)
        for name in wanted:
            print('\n[%s]' % name, flush=True)
            try:
                SUITES[name](B)
            except Exception as e:                        # a suite that cannot finish counts as a failure, and the others still run
                rec(name + ' suite finished', False, repr(e)[:200])
        B.b.close()
    passed = sum(1 for r in results if r[1])
    print('\n%d passed, %d failed' % (passed, len(results) - passed))
    sys.exit(0 if passed == len(results) else 1)
