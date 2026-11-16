# Get Molotov.ipa for free and sideload it (STANDALONE: no server, no API)
The app runs entirely on the phone (accounts, balances, transfers and history are stored on the device; sandbox/test money only).
Create several accounts on the same phone and send between them. Data is lost if you delete the app.
UNTESTED on real hardware: the standalone engine passed automated tests and a browser run; the macOS cloud build and the iPhone install were NOT run by the author.

## A. Build the IPA (free, no Mac)
1. Create a free GitHub account. New repository -> **Public** (public repos get free macOS build minutes).
2. Upload everything inside the `molotov-final` folder (drag the files into the repo page; keep the `.github` folder - if your browser hides it, use GitHub Desktop).
3. Open the **Actions** tab. The "Build unsigned iOS IPA" job starts by itself (or click Run workflow). Wait 20-40 minutes.
4. Open the finished run -> **Artifacts** -> download `Molotov-unsigned-ipa` -> unzip -> `Molotov-unsigned.ipa`.
   If the run shows a red X, open it and send the error text to Claude.

## B. Install it on your iPhone from Windows
5. Install **iTunes** and **iCloud** from apple.com (NOT the Microsoft Store versions), then **Sideloadly** (sideloadly.io).
6. iPhone: Settings -> Privacy & Security -> Developer Mode -> On (it restarts). Plug into the PC by USB, tap Trust.
7. Sideloadly: drag in `Molotov-unsigned.ipa`, enter a free Apple ID, click Start.
8. iPhone: Settings -> General -> VPN & Device Management -> trust your Apple ID. Open Molotov.
9. Free Apple IDs expire the app every 7 days: repeat step 7 (your data stays if you re-install over it).
