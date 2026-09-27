# Chalk

Announcement wall for a campus robotics club. Members share shop hours, arrange rides, and post about missing tools. Officers have a private desk page for notes that should stay off the public wall.

Built with Next.js App Router, Server Actions, and SQLite so it can run on a laptop or a single VM.

## Features

- Register with a `.edu` email, sign in, and sign out
- Public wall with pinned posts shown first
- Write posts with bold, italic, inline code, headings, lists, and links
- Authors can take down their own posts
- Officers can take down any post and view the private officer desk

## Run locally

You need Node 22.13+ (the app uses the built-in `node:sqlite` module). Run these commands from the Chalk folder containing `package.json`:

```bash
cp .env.example .env
npm install
npm run dev
```

If you are using Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep the terminal running while you use the site. The database is created automatically at `data/chalk.db`, with sample accounts and posts added when the app first initializes.

To build and run the production version:

```bash
npm run build
npm start
```

You can also run the seed script yourself:

```bash
npm run seed   # skips seeding if users already exist
```

## Run with Docker

```bash
docker compose up --build
```

The app listens on port 3000. Data lives in the `chalk-data` volume.

## Demo accounts

| Email | Password | Role |
|---|---|---|
| `maya@campus.edu` | `campus123` | Member |
| `devon@campus.edu` | `campus123` | Member |
| `priya@campus.edu` | `officer123` | Officer |

Register your own account if you want; the email just has to end in `.edu`. New accounts are members.

## Project layout

```text
app/page.js              Public wall
app/compose/page.js      Create a post
app/login/page.js        Sign in
app/register/page.js     Create an account
app/mod/page.js          Officer desk
app/layout.js            Shared layout and navigation
app/globals.css          Styles
lib/actions.js           Form submissions and permission checks
lib/auth.js              Password checks and sessions
lib/db.js                SQLite schema and connection
lib/markdown.js          Markdown formatting and HTML sanitization
lib/seed.js              Sample accounts, posts, and officer notes
components/PostBody.js   Displays a formatted post
```

## Assignment notes

Host the patched app somewhere your classmates and instructor can reach. Walk through the running site until you can explain:

- which code runs on the server and which runs in the browser
- how a session cookie becomes `currentUser`
- how a post moves from the compose form into SQLite and onto the wall
- where the app checks who can delete a post
- what an officer can see that a member cannot

Document the security defect, show how to reproduce it, and explain how the patch fixes it while keeping normal Markdown working. Submit the hosted URL, a short architecture sketch, the writeup, and the patched repository.
