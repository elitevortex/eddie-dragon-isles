# Eddie's Dragon Isles

A portfolio you fly through. You're a Chinese dragon gliding over a sea of cloud and Zhangjiajie stone pillars; each floating island holds a chapter of Eddie Chan's story, and landing on one unrolls its scroll.

**Play it:** https://eddie-dragon-isles.vercel.app/

- Third-person flight with keys, a touch stick, or your hand on camera (MediaPipe hand tracking)
- Five islands built from the story data: Home, Career, Community, Content and Life
- Fireballs that topple the pillars, day / sunset / night, four seasons with snow or rain
- Multiplayer: everyone flies in one shared sky and can knock each other down with fireballs (hold Tab to see who is flying)
- Everything is procedural Three.js with no model files; most sound is synthesised with Web Audio

## Layout

| Path | What |
|---|---|
| `dragon/` | the game: `index.html`, `isles.js` (world, dragon, battles), `sound.js`, `net.js`, `isles.css` |
| `data.js`, `assets/` | the story chapters, photos and reel covers the islands show |
| `ar/hands.js` | camera + hand tracking and gesture recognition |
| `server/` | local multiplayer relay (Node + `ws`) |
| `worker/` | the production relay on Cloudflare Workers, one Durable Object per room |
| `deploy.sh` | deploys the site to Vercel (and the relay with `--relay`) |

## Run it locally

```sh
python3 -m http.server 8781          # then open http://localhost:8781/dragon/
cd server && npm install && npm start  # multiplayer relay on ws://localhost:8787
```

On localhost the game uses the local relay automatically; anywhere else it uses the Cloudflare one. Add `?server=wss://…` to point at another relay.

## Credits

- Music: "Imperial China Cinematic" by Shane Ivers, [silvermansound.com](https://www.silvermansound.com), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Dragon breath sound effect: [tunetank.com](https://tunetank.com)
- Coin drop sound effect: gamestudio via [freesound](https://freesound.org)
- Built with [Three.js](https://threejs.org) and [MediaPipe Tasks](https://developers.google.com/mediapipe)

The code is shared to read and learn from. The photos, story and likeness are Eddie's and aren't for reuse.
