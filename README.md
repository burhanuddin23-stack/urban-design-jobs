# Maria's Marketing Internship Compass

Static website for browsing marketing and creative agencies in Paris and Luxembourg, with:

- active internship-friendly opportunities
- a separate agency directory
- browser-based alerts for new entries
- a live JSON feed at `data/marketing-companies.json`

## Local run

```bash
./run-site.sh
```

Then open `http://127.0.0.1:8000`.

## Update content

Edit `data/marketing-companies.json`.

The main website will pick up:

- `updatedAt`
- `hiringOpportunities`
- `agencyDirectory`
- `motivationalQuotes`

## GitHub Pages deployment

This repo includes `.github/workflows/deploy-pages.yml`.

Once the repository is pushed to GitHub:

1. Go to `Settings > Pages`
2. Set `Source` to `GitHub Actions`
3. Push changes to `main`

GitHub will publish the site automatically after each push, which lets you keep editing from your side by updating the repo and pushing again.
