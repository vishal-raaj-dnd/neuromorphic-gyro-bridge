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

async def test_suite():
    try:
        with urllib.request.urlopen('http://localhost:9229/json') as r:
            targets = json.loads(r.read().decode())
        target = next(t for t in targets if '8085' in t.get('url', ''))
        ws_url = target['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            time.sleep(1)

            scenarios = [
                {"name": "Head-On Threat (28 km/h, offset 0.0m)", "speed": 28.0, "offset": 0.0},
                {"name": "Threat From Right (28 km/h, offset +0.9m)", "speed": 28.0, "offset": 0.9},
                {"name": "Threat From Left (28 km/h, offset -0.9m)", "speed": 28.0, "offset": -0.9},
                {"name": "High-Speed Swatter (38 km/h, offset 0.0m)", "speed": 38.0, "offset": 0.0}
            ]

            results = []

            for sc in scenarios:
                await ws.send(json.dumps({'id': 10, 'method': 'Runtime.evaluate', 'params': {'expression': 'resetArena();'}}))
                time.sleep(0.3)
                launch_expr = f'launchThreat({sc["speed"]}, {sc["offset"]});'
                await ws.send(json.dumps({'id': 11, 'method': 'Runtime.evaluate', 'params': {'expression': launch_expr}}))

                min_clear = 999.0
                max_x = 0.0
                alt_min = 999.0
                alt_max = -999.0
                success = False

                for _ in range(35):
                    time.sleep(0.05)
                    poll_expr = """
                    JSON.stringify({
                        clr: state.brain.min_clearance,
                        y: state.drone.pos.y,
                        x: state.drone.pos.x,
                        vx: state.drone.vel.x,
                        phase: state.evasion.phase,
                        banner_hidden: document.getElementById('result-banner').classList.contains('hidden'),
                        is_crash: document.getElementById('result-banner').classList.contains('crash')
                    })
                    """
                    await ws.send(json.dumps({'id': 20, 'method': 'Runtime.evaluate', 'params': {'expression': poll_expr}}))
                    while True:
                        msg = json.loads(await ws.recv())
                        if msg.get('id') == 20 and 'result' in msg:
                            d = json.loads(msg['result']['result']['value'])
                            if d['clr'] < min_clear: min_clear = d['clr']
                            if abs(d['x']) > max_x: max_x = abs(d['x'])
                            if d['y'] < alt_min: alt_min = d['y']
                            if d['y'] > alt_max: alt_max = d['y']
                            if not d['banner_hidden'] and not d['is_crash']:
                                success = True
                            break

                results.append({
                    "name": sc["name"],
                    "min_clearance": min_clear,
                    "max_displacement": max_x,
                    "alt_range": f"{alt_min:.2f}m - {alt_max:.2f}m",
                    "status": "PASS (DODGED)" if min_clear >= 0.63 or success else "CRASH"
                })

            print("\n==========================================================================")
            print("MULTI-SCENARIO BIOLOGICAL EVASION VERIFICATION SUITE")
            print("==========================================================================")
            for r in results:
                print(f"[{r['status']}] {r['name']}:")
                print(f"      Clearance: {r['min_clearance']:.2f} m | Displacement: {r['max_displacement']:.2f} m | Altitude: {r['alt_range']}")
            print("==========================================================================\n")

    finally:
        proc.terminate()

asyncio.run(test_suite())
