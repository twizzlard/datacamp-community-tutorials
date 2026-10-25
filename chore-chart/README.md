# Chore Chart

A fridge-tablet chore chart for three kids. The main chores rotate every week, any job can be swapped or handed to another kid for a single week, and each kid has a "days since last shower" counter with a one-tap **Showered!** button.

Plain HTML/CSS/JS with no build step. One small Vercel function stores the data in Upstash Redis so the fridge and your phone stay in sync.

## Set it up

All the names, chores and looks are in **`config.js`**:

- `kids`: name, color, and `look` (skin, hair style and color, shirt, an emblem, optional `glasses`, `freckles`, `bow`). The stickers are drawn from these values. To see every sticker for every kid, open `tests/stickers.html` from a local server (see below).
- `chores`: the rotating jobs. `icon` picks the scene (`dishes`, `trash`, `sweep`, `laundry`, `table`, `toys`, `plants`, `pet`, `vacuum`, `bed`). `when` is `daily` (one check per day) or `weekly` (one check per week).
- `everyone`: jobs every kid does every day, like making the bed. These don't rotate.
- `rotationStart`, `weekStartsOn`, `showerEvery`.

Keep `id`s as letters, numbers and dashes, and don't change them once you're using the chart. The saved history is keyed on them.

## Deploy to Vercel

1. In Vercel, choose **Add New → Project** and import this repo. Set **Root Directory** to `chore-chart` and **Framework Preset** to *Other*, then deploy. The page works right away, saving to that device only.
2. To sync across devices, open the project's **Storage** tab (or the Marketplace), add **Upstash for Redis** on the free plan, and connect it to the project. Vercel adds the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars for you. Redeploy.
3. Recommended: under **Settings → Environment Variables**, add `FAMILY_KEY` with any passphrase, then redeploy. Without it, anyone who finds the URL can see and change the chart.
4. On each device, open `https://<your-app>.vercel.app/?key=<FAMILY_KEY>` once. The key is saved on the device and removed from the address bar.

If a device already has data saved locally when the database is first connected, that data is uploaded automatically.

### Fridge tablet tips

- Use **Add to Home Screen** to get a full-screen app.
- The page asks the browser to keep the screen awake. If the browser refuses (Settings shows this), set the tablet's auto-lock to *Never*. On an iPad, Guided Access will also keep kids inside the app.
- The page reloads itself once a night, after 3am, so it picks up any changes you deploy.

## How it works

- **Rotation:** in the week containing `rotationStart`, `chores[0]` goes to `kids[0]`, `chores[1]` to `kids[1]`, and so on. Every week each kid moves down one chore. If the rotation gets out of step, **Settings → Rotation** shifts everyone by one.
- **Swaps:** tap a job's picture. *Swap jobs with* trades two kids' jobs. *Or give it to* hands one job to a single kid. Both apply to the week you're viewing only. Use the arrows in the header to plan next week's swaps ahead of time.
- **Showers:** **Showered!** logs a shower now, with an Undo. Tap the counter to log one for last night, or to delete a mistake. The counter turns amber on the day a shower is due (`showerEvery` days after the last one) and red after that.
- **Storage:** everything lives in one Redis hash of small fields, such as `shower|kid1|<time>` and `ov|<week>|dishes`. Each tap is an atomic `HSET` or `HDEL`, so two devices can't overwrite each other. A tap made while offline is queued on the device and sent once the connection returns. Entries older than about four months are pruned.

## Run it locally

```bash
cd chore-chart
python3 -m http.server 8000      # http://localhost:8000 (on-device storage, no sync)
node --test tests/*.test.mjs     # rotation, swap, shower and API tests (Node 22+)
```

To try it with sync locally, use `npx vercel dev` with the Upstash env vars set.
