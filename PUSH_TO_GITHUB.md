# Push to GitHub

The hackathon repo is ready. To upload it to your new GitHub repository:

## 1. Create repository on GitHub

- Go to [github.com/new](https://github.com/new)
- Name it e.g. `pixel-farm-valley-hackathon` or `solana-hackathon-pixelvalley`
- Choose **Public**
- **Do NOT** initialize with README, .gitignore, or License (we already have these)
- Click **Create repository**

## 2. Push from local

From the `hackathon-export` folder (or after copying its contents to your new clone):

```bash
cd hackathon-export   # or your copy

git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

## 3. Optional: Delete this file

After pushing, you can remove `PUSH_TO_GITHUB.md` from the repo — it's only for the initial setup.
