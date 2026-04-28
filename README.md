# CMPA Program Preference Tool

A dependency-free prototype web app for comparing school programs, detecting distinctive components, building grade-10 survey items, and scoring a student's preferred program match.

## Run

Open `index.html` in a browser, or serve this folder locally:

```powershell
node server.mjs
```

Then visit `http://localhost:4173`.

## Current Flow

1. Paste two or more program descriptions, or load the built-in demo.
2. Click **Analyze**.
3. Review unique components detected with TF-IDF-style phrase scoring.
4. Build Likert and/or forced-choice items.
5. Complete the survey and score the program match.

The CSV upload reads item-bank files shaped like the existing `items.csv` file in the parent folder. In this first prototype, it summarizes the imported item bank; the generated survey is based on pasted program descriptions.
