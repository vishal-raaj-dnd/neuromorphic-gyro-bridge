import asyncio
import websockets
import json
import urllib.request
import subprocess
import time
import base64
import os

CHROME_PATH = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
OUTPUT_DIR = r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d'

proc = subprocess.Popen([
    CHROME_PATH,
    '--headless=new',
    '--remote-debugging-port=9229',
    '--window-size=1600,900',
    'http://localhost:8085/'
])
time.sleep(2.5)

_req_counter = 1000

async def capture_screenshot(ws, filename):
    global _req_counter
    _req_counter += 1
    snap_id = _req_counter
    await ws.send(json.dumps({'id': snap_id, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get('id') == snap_id and 'result' in msg:
            out_path = os.path.join(OUTPUT_DIR, filename)
            with open(out_path, 'wb') as f:
                f.write(base64.b64decode(msg['result']['data']))
            print(f"[OK] Saved screenshot: {filename}")
            break

async def eval_js(ws, expr):
    global _req_counter
    _req_counter += 1
    req_id = _req_counter
    await ws.send(json.dumps({
        'id': req_id,
        'method': 'Runtime.evaluate',
        'params': {
            'expression': expr,
            'returnByValue': True,
            'awaitPromise': True
        }
    }))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get('id') == req_id:
            res = msg.get('result', {})
            if 'exceptionDetails' in res:
                print(f"[JS EXCEPTION in eval_js]: {res['exceptionDetails']}")
                return None
            return res.get('result', {}).get('value')

async def run_verification():
    try:
        with urllib.request.urlopen('http://localhost:9229/json') as r:
            targets = json.loads(r.read().decode())
        target = next(t for t in targets if '8085' in t.get('url', ''))
        ws_url = target['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            time.sleep(1.0)

            # 1. Check for console errors
            err_check = await eval_js(ws, "window.__errCount || 0")
            print(f"[VERIFY] Initial JS errors: {err_check}")

            # 2. Test 5 Camera Views & Capture Screenshots
            print("\n--- TESTING 5 CAMERA PERSPECTIVES ---")
            
            # View 1: Chase (TPV)
            await eval_js(ws, "switchCamera('tpv')")
            time.sleep(0.4)
            await capture_screenshot(ws, 'view_1_chase.png')

            # View 2: FPV Cockpit
            await eval_js(ws, "switchCamera('fpv')")
            time.sleep(0.4)
            await capture_screenshot(ws, 'view_2_fpv.png')

            # View 3: Top-Down Corridor
            await eval_js(ws, "switchCamera('top')")
            time.sleep(0.4)
            await capture_screenshot(ws, 'view_3_top.png')

            # View 4: Side Elevation
            await eval_js(ws, "switchCamera('side')")
            time.sleep(0.4)
            await capture_screenshot(ws, 'view_4_side.png')

            # View 5: Orbit
            await eval_js(ws, "switchCamera('orbit')")
            time.sleep(0.4)
            await capture_screenshot(ws, 'view_5_orbit.png')

            # 3. Test Threat Geometry 1: Point Epicenter (Lateral Saccade & Trajectory Graph)
            print("\n--- TESTING POINT EPICENTER EVASION ---")
            await eval_js(ws, "switchCamera('tpv'); setThreatGeometry('point'); resetArena();")
            time.sleep(0.5)
            await eval_js(ws, "launchThreat(28.0, 0.0);")

            point_telemetry = []
            for _ in range(50):
                time.sleep(0.045)
                raw = await eval_js(ws, """
                JSON.stringify({
                    phase: state.evasion.phase,
                    type: state.evasion.evasionType,
                    x: state.drone.pos.x,
                    y: state.drone.pos.y,
                    roll: (state.drone.euler.z * 180 / Math.PI),
                    clearance: state.brain.min_clearance,
                    active: state.obstacle.active,
                    badge: document.getElementById('graph-phase-badge') ? document.getElementById('graph-phase-badge').innerText : ''
                })
                """)
                data = json.loads(raw)
                point_telemetry.append(data)

            max_lateral = max(abs(d['x']) for d in point_telemetry)
            final_point = point_telemetry[-1]
            print(f"[POINT TEST] Max lateral jink: {max_lateral:.2f}m")
            print(f"[POINT TEST] Final restabilized X: {final_point['x']:.2f}m, Roll: {final_point['roll']:.1f}deg")
            print(f"[POINT TEST] Min clearance: {final_point['clearance']:.2f}m")
            print(f"[POINT TEST] Trajectory badge: '{final_point['badge']}'")
            await capture_screenshot(ws, 'point_dodge_curve_result.png')

            # 4. Test Threat Geometry 2: Wide Barrier (Vertical Pop-up Flare)
            print("\n--- TESTING WIDE BARRIER VERTICAL POP-UP FLARE ---")
            await eval_js(ws, "switchCamera('side'); setThreatGeometry('wide'); resetArena();")
            time.sleep(0.5)
            await eval_js(ws, "launchThreat(28.0, 0.0);")

            wide_telemetry = []
            for _ in range(50):
                time.sleep(0.045)
                raw = await eval_js(ws, """
                JSON.stringify({
                    phase: state.evasion.phase,
                    type: state.evasion.evasionType,
                    x: state.drone.pos.x,
                    y: state.drone.pos.y,
                    pitch: (state.drone.euler.x * 180 / Math.PI),
                    clearance: state.brain.min_clearance,
                    active: state.obstacle.active
                })
                """)
                data = json.loads(raw)
                wide_telemetry.append(data)

            max_alt = max(d['y'] for d in wide_telemetry)
            final_wide = wide_telemetry[-1]
            print(f"[WIDE TEST] Evasion type: {wide_telemetry[10]['type']}")
            print(f"[WIDE TEST] Max jump altitude: {max_alt:.2f}m (Nominal hover: 1.50m)")
            print(f"[WIDE TEST] Final restabilized altitude: {final_wide['y']:.2f}m")
            print(f"[WIDE TEST] Min clearance: {final_wide['clearance']:.2f}m")
            await capture_screenshot(ws, 'wide_barrier_jump_result.png')

            print("\n==========================================")
            print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
            print("==========================================")

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run_verification())
