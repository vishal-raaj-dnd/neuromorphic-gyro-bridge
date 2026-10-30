import asyncio
import websockets
import json
import urllib.request
import subprocess
import time
import base64

CHROME_PATH = r'C:\Program Files\Google\Chrome\Application\chrome.exe'

proc = subprocess.Popen([
    CHROME_PATH,
    '--headless=new',
    '--remote-debugging-port=9229',
    '--window-size=1600,900',
    'http://localhost:8085/'
])
time.sleep(2.5)

async def capture_closest_pass():
    try:
        with urllib.request.urlopen('http://localhost:9229/json') as r:
            targets = json.loads(r.read().decode())
        target = next(t for t in targets if '8085' in t.get('url', ''))
        ws_url = target['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            time.sleep(0.5)

            # Ensure nature environment, TPV view, and trigger threat
            await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': 'switchEnvironment("nature"); switchCamera("tpv"); resetArena(); launchThreat(28.0, 0.0);'}}))

            captured = False
            for step in range(150):
                time.sleep(0.035)
                eval_id = 200 + step
                expr = "JSON.stringify({ dz: Math.abs(state.obstacle.pos.z - state.drone.pos.z), obs_z: state.obstacle.pos.z, d_x: state.drone.pos.x, active: state.obstacle.active })"
                await ws.send(json.dumps({'id': eval_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get('id') == eval_id and 'result' in msg:
                        data = json.loads(msg['result']['result']['value'])
                        break
                
                # When obstacle is right alongside drone (within 0.8m of drone Z)
                if not captured and data['active'] and data['dz'] < 1.2:
                    captured = True
                    snap_id = 999
                    await ws.send(json.dumps({'id': snap_id, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
                    while True:
                        s_msg = json.loads(await ws.recv())
                        if s_msg.get('id') == snap_id and 'result' in s_msg:
                            with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\closest_pass_gap.png', 'wb') as f:
                                f.write(base64.b64decode(s_msg['result']['data']))
                            print(f"[VERIFY] Captured closest_pass_gap.png at dz={data['dz']:.2f}m, drone_x={data['d_x']:.2f}m")
                            break
                    break
    finally:
        proc.terminate()

asyncio.run(capture_closest_pass())
