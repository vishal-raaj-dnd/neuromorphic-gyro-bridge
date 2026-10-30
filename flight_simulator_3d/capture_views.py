import asyncio
import websockets
import json
import urllib.request
import subprocess
import time
import base64

proc = subprocess.Popen([
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless=new',
    '--remote-debugging-port=9227',
    '--window-size=1600,900',
    'http://localhost:8085/'
])
time.sleep(2)

async def test():
    try:
        with urllib.request.urlopen('http://localhost:9227/json') as r:
            targets = json.loads(r.read().decode())
        target = next(t for t in targets if '8085' in t.get('url', ''))
        ws_url = target['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            time.sleep(1)
            
            # 1. Capture Lush Green Nature Flight
            await ws.send(json.dumps({'id': 10, 'method': 'Runtime.evaluate', 'params': {'expression': 'switchEnvironment("nature"); switchCamera("tpv")'}}))
            time.sleep(0.5)
            await ws.send(json.dumps({'id': 11, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == 11 and 'result' in msg:
                    with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\nature_flight_view.png', 'wb') as f:
                        f.write(base64.b64decode(msg['result']['data']))
                    print('Nature flight view saved!')
                    break
            
            # 2. Trigger Threat Evasion
            await ws.send(json.dumps({'id': 20, 'method': 'Runtime.evaluate', 'params': {'expression': 'launchThreat(28.0, 0.0)'}}))
            time.sleep(0.9)
            await ws.send(json.dumps({'id': 21, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == 21 and 'result' in msg:
                    with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\threat_evasion_view.png', 'wb') as f:
                        f.write(base64.b64decode(msg['result']['data']))
                    print('Threat evasion view saved!')
                    break

            # 3. Capture FPV Cockpit
            await ws.send(json.dumps({'id': 30, 'method': 'Runtime.evaluate', 'params': {'expression': 'switchCamera("fpv")'}}))
            time.sleep(0.5)
            await ws.send(json.dumps({'id': 31, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == 31 and 'result' in msg:
                    with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\fpv_cockpit_view.png', 'wb') as f:
                        f.write(base64.b64decode(msg['result']['data']))
                    print('FPV cockpit view saved!')
                    break

            # 4. Capture Cyber Hangar Environment
            await ws.send(json.dumps({'id': 40, 'method': 'Runtime.evaluate', 'params': {'expression': 'switchCamera("tpv"); switchEnvironment("hangar")'}}))
            time.sleep(0.5)
            await ws.send(json.dumps({'id': 41, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == 41 and 'result' in msg:
                    with open(r'c:\Users\bdurk\Downloads\New folder (6)\flight_simulator_3d\hangar_lab_view.png', 'wb') as f:
                        f.write(base64.b64decode(msg['result']['data']))
                    print('Hangar lab view saved!')
                    break

            # Restore Nature Environment
            await ws.send(json.dumps({'id': 50, 'method': 'Runtime.evaluate', 'params': {'expression': 'switchEnvironment("nature")'}}))
    finally:
        proc.terminate()

asyncio.run(test())
