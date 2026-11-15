# New Project Setup Guide

Steps to add a new project under `productdelivered.ca` based on the itin-wizard/neil-branding setup.

---

## Prerequisites
- Access to the Cloudflare account (`neil@productdelivered.ca`) — the `productdelivered.ca` zone lives there
- SSH key setup already done for neil-branding (reuse the same pattern)

---

## Step 1 — Build the Project Locally

1. Create the project directory: `~/your-project-name`
2. Build the app (with AI or manually)
3. In `vite.config.ts` keep the base path at the root — the app is served from its own subdomain:
   ```ts
   base: '/'
   ```
4. Create `wrangler.jsonc` so Cloudflare serves the build as static assets with SPA fallback:
   ```jsonc
   {
     "name": "your-project-name",
     "compatibility_date": "2026-09-01",
     "workers_dev": true,
     "routes": [
       { "pattern": "your-project-name.productdelivered.ca", "custom_domain": true }
     ],
     "assets": {
       "directory": "./dist",
       // every unknown path serves the SPA shell
       "not_found_handling": "single-page-application"
     }
   }
   ```
   Add a deploy script to `package.json`: `"deploy:cloudflare": "vite build && npx --yes wrangler@4 deploy"`.
   Don't add a `public/_redirects` catch-all — it loops on Cloudflare, and `not_found_handling` already covers it.

---

## Step 2 — GitHub Setup

1. Create a new repo on GitHub: `your-project-name`
2. Generate a new SSH deploy key:
   ```bash
   ssh-keygen -t ed25519 -C "your-project-name" -f ~/.ssh/your_project_deploy
   ```
3. Add the public key to the GitHub repo:
   - GitHub → repo → Settings → Deploy Keys → Add deploy key
   - Paste contents of `~/.ssh/your_project_deploy.pub`
   - Check **Allow write access**
4. Add SSH host alias to `~/.ssh/config`:
   ```
   Host github.com-your-project-name
     HostName github.com
     User git
     IdentityFile ~/.ssh/your_project_deploy
     IdentitiesOnly yes
   ```
5. Initialize and push:
   ```bash
   cd ~/your-project-name
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin git@github.com-your-project-name:neilstryjski-git/your-project-name.git
   git push -u origin master
   ```

---

## Step 3 — Deploy to Cloudflare

1. `npx wrangler login` (once per machine), then `npm run deploy:cloudflare`
2. Note the `your-project-name.<account>.workers.dev` preview URL and check it loads
3. Optional — deploy on push: copy `.github/workflows/deploy-cloudflare.yml` from neil-branding and add a
   `CLOUDFLARE_API_TOKEN` repo secret

---

## Step 4 — Subdomain Setup

The `routes` entry with `"custom_domain": true` creates the DNS record and certificate on deploy — no manual
CNAME. If a DNS record with that name already exists in the Cloudflare zone, delete it first (Cloudflare refuses
a custom domain over an existing record). Then verify:
```bash
curl -I https://your-project-name.productdelivered.ca
```
Should return `HTTP/2 200` with `server: cloudflare`

---

## Step 5 — Add to Landing Page

In `~/neil_branding/index.html`, find the projects section and add a new entry:

```html
<a class="project-link" href="https://your-project-name.productdelivered.ca">
  <div>
    <div class="project-name">Your Project Name</div>
    <div class="project-desc">Short description of what it does</div>
  </div>
  <div class="arrow">&#8594;</div>
</a>
```

Then push the neil-branding update:
```bash
cd ~/neil_branding
git add index.html
git commit -m "Add your-project-name to landing page"
git push
```

---

## Notes
- Each project gets its own SSH deploy key, GitHub repo, and Cloudflare Worker
- Subdomains (`your-project-name.productdelivered.ca`) are free on Cloudflare Workers static assets; static requests aren't metered
- Hosting moved from Vercel to Cloudflare in 2026-09 (Vercel's Hobby plan forbids commercial use) — see `docs/hosting-migration/` in the vechelon repo
- Path-based hosting (`productdelivered.ca/your-project-name`) would need a non-root `base` plus a route on the marketing Worker — prefer a subdomain
