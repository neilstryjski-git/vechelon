# New Project Setup Guide

Steps to add a new project under `productdelivered.ca` based on the itin-wizard/neil-branding setup.

---

## Prerequisites
- Access to your DNS provider
- Access to Vercel dashboard
- SSH key setup already done for neil-branding (reuse the same pattern)

---

## Step 1 — Build the Project Locally

1. Create the project directory: `~/your-project-name`
2. Build the app (with AI or manually)
3. In `vite.config.ts` set the base path:
   ```ts
   base: '/your-project-name/'
   ```
4. Create `vercel.json` for SPA client-side routing:
   ```json
   {
     "rewrites": [
       {
         "source": "/your-project-name/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

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

## Step 3 — Vercel Setup

1. Vercel dashboard → **Add New Project** → Import from GitHub
2. Grant Vercel access to the new repo if needed (GitHub App Permissions)
3. Select the repo → Framework: depends on project → **Deploy**
4. Once deployed, note the `*.vercel.app` URL

---

## Step 4 — Subdomain Setup

1. In your DNS provider, add a CNAME record:
   - **Name:** `your-project-name`
   - **Target:** `cname.vercel-dns.com`
2. In Vercel → your project → Settings → Domains → add `your-project-name.productdelivered.ca`
3. Wait for DNS propagation, then verify:
   ```bash
   curl -I https://your-project-name.productdelivered.ca
   ```
   Should return `HTTP/2 200`

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
- Each project gets its own SSH deploy key, GitHub repo, and Vercel project
- Subdomains (`your-project-name.productdelivered.ca`) work on Vercel's free plan
- Path-based routing (`productdelivered.ca/your-project-name`) requires Vercel Pro
- The `base` path in `vite.config.ts` and the `vercel.json` rewrite must match exactly
