Set sh = WScript.CreateObject("WScript.Shell")
sh.Run "cmd /k ""title Two Dots Install+Deploy && cd /d C:\Claude\Two Dots\two-dots && npm install --legacy-peer-deps && npx expo run:android""", 1, False
