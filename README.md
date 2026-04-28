# CMPA Program Preference Tool

A dependency-free prototype web app for comparing school programs, detecting distinctive components, building grade-10 survey items, and scoring a student's preferred program match.

## Run

Open `index.html` in a browser for pasted catalog text, or serve this folder locally when you want to fetch program webpages:

```powershell
node server.mjs
```

Then visit `http://localhost:4173`.

Website URL fetching will not work from GitHub Pages or by opening `index.html` directly, because the app needs the local `/api/extract` endpoint in `server.mjs` to fetch external pages and avoid browser CORS limits.

## Current Flow

1. Add two or more programs.
2. Choose the source type:
   - **Catalog text** uses pasted program/catalog details directly.
   - **Website URL** fetches the page through the local server and extracts likely program description, course, curriculum, outcomes, career, and target-student sections.
   - **Pasted website copy** filters common website navigation and marketing boilerplate before analysis.
2. Click **Analyze**.
3. Review unique components detected with TF-IDF-style phrase scoring.
4. Build Likert and/or forced-choice items.
5. Complete the survey and score the program match.

The CSV upload reads item-bank files shaped like the existing `items.csv` file in the parent folder. In this first prototype, it summarizes the imported item bank; the generated survey is based on pasted program descriptions.
