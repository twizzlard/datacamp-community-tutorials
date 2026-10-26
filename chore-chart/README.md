# Chore Chart

A fridge-tablet chore chart for three kids, laid out like a paper sticker chart: tasks down the side, Sunday to Friday across. Each kid has a weekly job (a chore plus a room) that rotates every week and can be swapped for a single week, a list of every-day tasks, a shower counter showing the day of their last shower, badges, and a celebration every time they check a box. A "Who let Bamba out?" bar gives a paw point to whoever lets the dog out.

Plain HTML/CSS/JS with no build step. One small Vercel function stores the data in Upstash Redis so the fridge and your phone stay in sync.

## Set it up

All the names, chores and looks are in **`config.js`**:

- `kids`: name, color, and `look` (skin, hair style and color, shirt, an emblem, optional `glasses`, `freckles`, `bow`). The stickers are drawn from these values. To see every sticker for every kid, open `tests/stickers.html` from a local server (see below).
- `chores`: the weekly jobs that rotate. Each can have a `room`, which travels with it. `icon` picks the scene; the full list is in `config.js`. `when` is `daily` (one box per day) or `weekly` (one box per week).
- `everyone`: tasks every kid does every day. These don't rotate.
- `days`: which days get a box (Sunday to Friday by default). A single task can have its own `days`.
- `pet`: the dog's name, colors and the cooldown between trips. Set it to `null` to hide the dog bar.
- `rotationStart`, `weekStartsOn`, `showerEvery`.

Keep `id`s as letters, numbers and dashes, and don't change them once you're using the chart. The saved history is keyed on them.

## Deploy to Vercel

1. In Vercel, choose **Add New → Project** and import this repo. Set **Root Directory** to `chore-chart` and **Framework Preset** to *Other*, then deploy. The page works right away, saving to that device only.
2. To sync across devices, open the project's **Storage** tab (or the Marketplace), add **Upstash for Redis** on the free plan, and connect it to the project. Vercel adds the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars for you. Redeploy.
3. Recommended: under **Settings → Environment Variables**, add `FAMILY_KEY` with any passphrase, then redeploy. Without it, anyone who finds the URL can see and change the chart.
4. On each device, open `https://<your-app>.vercel.app/?key=<FAMILY_KEY>` once. The key is saved on the device and removed from the address bar.

If a device already has data saved locally when the database is first connected, that data is uploaded automatically.

### Fridge tablet tips

The layout adapts to the screen. A portrait tablet (for example a Galaxy Tab at about 800×1280) gets one wide band per kid. A landscape tablet gets three columns. A phone gets one long column.

On a Samsung or other Android tablet:

- In Chrome, use **⋮ → Add to Home screen** (in Samsung Internet, **☰ → Add page to → Home screen**). Opening it from the icon runs it full screen, which leaves more room for the chart.
- The page keeps the screen awake while it's open. If Settings in the app says the browser refused, go to **Settings → Display → Screen timeout** and pick the longest option.
- To keep kids inside the app, turn on **Pin app** (called **Pin windows** on some versions) under **Settings → Security and privacy → More security settings**.
- If the tablet stays plugged in, turn on battery protection (the 80–85% charge limit) under **Settings → Battery**, so it isn't sitting at 100% around the clock.
- The page reloads itself once a night, after 3am, so it picks up any changes you deploy.

## How it works

- **Rotation:** in the week containing `rotationStart`, `chores[0]` goes to `kids[0]`, `chores[1]` to `kids[1]`, and so on. Every week each kid moves down one chore. If the rotation gets out of step, **Settings → Rotation** shifts everyone by one.
- **Swaps:** tap a weekly job's name. *Swap jobs with* trades two kids' jobs. *Or give it to* hands one job to a single kid. Both apply to the week you're viewing only. Use the arrows in the header to plan next week's swaps ahead of time.
- **Showers:** **Showered!** logs a shower now, with an Undo. It counts once per kid per day: pressing it again, on any device, doesn't add another; it offers to remove that day's shower instead. The counter shows the day of the last shower and how many days ago it was. Tap it to log one for last night or to delete a mistake. It turns amber on the night a shower is due (`showerEvery` days after the last one) and red after that.
- **The dog:** whoever lets Bamba out taps their face on the dog bar and gets a paw point for the week. The bar shows when she last went out and with whom. A tap within 10 minutes of the last trip doesn't count, so nobody piles up points by tapping twice. Tap Bamba's picture to see recent trips or remove a mistake.
- **Celebrations:** each check plays a different effect (confetti, stars, hearts, bubbles, fireworks, sparkles, or the kid's sticker popping out) with a cheer. Finishing every box for the day brings up a big card. When all three finish, it's a Team day card. All of it is skipped if the device is set to reduce motion.
- **Awards** (the trophy button): Early bird (first to finish today), On a roll (streak of complete days), Steady star (most boxes this week), Perfect week, Squeaky clean (never late for a shower), Comeback kid (well ahead of last week's pace), Team day (everyone finished; everyone gets it) and Top dog (most trips with Bamba). They're worked out from the check-off times already saved, so changing the rules in `awards.js` re-scores past weeks too.
- **Storage:** everything lives in one Redis hash of small fields, such as `shower|raya|<date>`, `dog|<time>` and `ov|<week>|sweep`. Each tap is an atomic `HSET` or `HDEL`, so two devices can't overwrite each other. A tap made while offline is queued on the device and sent once the connection returns. Entries older than about four months are pruned.

## Run it locally

```bash
cd chore-chart
python3 -m http.server 8000      # http://localhost:8000 (on-device storage, no sync)
node --test tests/*.test.mjs     # rotation, swap, shower, award and API tests (Node 22+)
```

To try it with sync locally, use `npx vercel dev` with the Upstash env vars set.
