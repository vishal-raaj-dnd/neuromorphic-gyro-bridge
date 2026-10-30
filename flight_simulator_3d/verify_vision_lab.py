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
    '--remote-debugging-port=9230',
    '--window-size=1600,900',
    'http://localhost:8085/'
])
time.sleep(2.5)

async def test_vision_lab():
    try:
        with urllib.request.urlopen('http://localhost:9230/json') as r:
            targets = json.loads(r.read().decode())
        target = next(t for t in targets if '8085' in t.get('url', ''))
        ws_url = target['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            time.sleep(0.5)

            # Switch to Vision Lab tab and trigger sample demo flight
            await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': """
                document.getElementById('tab-vision-btn').click();
                document.getElementById('load-sample-video-btn').click();
            """}}))

            print("[VISION LAB] Activated Vision Lab & Loaded Demo Flight...")

            # Wait for frame extraction and looming threat processing (approx 2.5 seconds)
            time.sleep(2.5)

            # Read out live telemetry values
            expr = """
            JSON.stringify({
                frameTime: document.getElementById('track-frame-time').innerText,
                reactionTime: document.getElementById('track-reaction-time').innerText,
                ttc: document.getElementById('track-ttc').innerText,
                looming: document.getElementById('track-looming-val').innerText,
                decision: document.getElementById('direction-decision-pill').innerText,
                roll: document.getElementById('bar-roll-val').innerText,
                leftPct: document.getElementById('bar-left-pct').innerText,
                rightPct: document.getElementById('bar-right-pct').innerText
            })
            """
            await ws.send(json.dumps({'id': 10, 'method': 'Runtime.evaluate', 'params': {'expression': expr}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == 10 and 'result' in msg:
                    telemetry = json.loads(msg['result']['result']['value'])
                    print("==================================================")
                    print("LIVE FPV VISION PROCESSOR TELEMETRY REPORT")
                    print("==================================================")
                    print(f"Frame Processing Latency: {telemetry['frameTime']}")
                    print(f"Reaction On-Spot Latency: {telemetry['reactionTime']}")
                    print(f"Optical Divergence TTC:   {telemetry['ttc']}")
                    print(f"Looming Metric:           {telemetry['looming']}")
                    print(f"Directional Decision:     {telemetry['decision']}")
                    print(f"Commanded Roll Bank:      {telemetry['roll']}")
                    print(f"Left Dodge Bar Fill:      {telemetry['leftPct']}")
                    print(f"Right Dodge Bar Fill:     {telemetry['rightPct']}")
                    print("==================================================")
                    break

            # Capture Full Page Screenshot
            snap_id = 99
            await ws.send(json.dumps({'id': snap_id, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                s_msg = json.loads(await ws.recv())
                if s_msg.get('id') == snap_id and 'result' in s_msg:
                    with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\vision_lab_active.png', 'wb') as f:
                        f.write(base64.b64decode(s_msg['result']['data']))
                    print("[VERIFY] Captured vision_lab_active.png successfully!")
                    break

    finally:
        proc.terminate()

asyncio.run(test_vision_lab())
