const programList = document.querySelector("#programList");
const programTemplate = document.querySelector("#programTemplate");
const addProgramBtn = document.querySelector("#addProgramBtn");
const loadDemoBtn = document.querySelector("#loadDemoBtn");
const analyzeBtn = document.querySelector("#analyzeBtn");
const featureSummary = document.querySelector("#featureSummary");
const emptyState = document.querySelector("#emptyState");
const surveyForm = document.querySelector("#surveyForm");
const buildSurveyBtn = document.querySelector("#buildSurveyBtn");
const includeLikert = document.querySelector("#includeLikert");
const includeForced = document.querySelector("#includeForced");
const matchResults = document.querySelector("#matchResults");
const itemBankInput = document.querySelector("#itemBankInput");
const itemBankStatus = document.querySelector("#itemBankStatus");

const state = {
  programs: [],
  analysis: [],
  questions: [],
  itemBank: []
};

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "between", "both",
  "but", "by", "campus", "can", "career", "careers", "certificate", "college", "contact",
  "course", "courses", "credit", "credits", "curriculum", "degree", "department", "do", "does", "doing",
  "during", "each", "faculty", "fees", "for", "from", "further", "graduate", "had", "has", "have", "having", "he", "her",
  "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself",
  "learn", "learning", "major", "may", "more", "most", "online", "of", "on", "or", "other", "our",
  "out", "over", "overview", "own", "page", "pathway", "program", "programs", "school", "she", "should", "so", "some",
  "student", "students", "study", "such", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "transfer", "tuition", "under", "undergraduate", "until", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "within", "year", "years", "you", "your"
]);

const LOW_SIGNAL_TERMS = new Set([
  "admission", "admissions", "apply", "application", "available", "based", "choose",
  "complete", "completion", "education", "eligible", "enroll", "experience", "field",
  "full", "information", "opportunities", "option", "options", "prepare", "professional",
  "requirements", "required", "skills", "support", "work"
]);

const DEMO_PROGRAMS = [
  {
    name: "Biomedical Innovation",
    text: "Students explore human health, anatomy, genetics, disease prevention, laboratory safety, biotechnology, and medical research. The program includes lab experiments, case studies, hospital shadowing, data analysis, and a capstone project where students design a health solution for a real community need."
  },
  {
    name: "Digital Media Design",
    text: "Students create websites, short videos, animations, podcasts, games, and social media campaigns. The program focuses on visual storytelling, user experience, branding, digital tools, audience research, and portfolio building. Students work in teams with local clients and present finished creative projects."
  },
  {
    name: "Environmental Policy",
    text: "Students study climate change, water quality, urban planning, environmental justice, land use, and public policy. The program includes field research, community surveys, policy writing, map analysis, and debates. Students recommend practical changes for schools, parks, or city neighborhoods."
  },
  {
    name: "Business Entrepreneurship",
    text: "Students learn market research, budgeting, sales, product design, pitching, customer interviews, and business planning. The program includes simulations, guest speakers, financial decision making, and a final startup pitch where teams test an idea and explain how it could earn revenue."
  }
];

function addProgram(program = {}) {
  const node = programTemplate.content.firstElementChild.cloneNode(true);
  const nameInput = node.querySelector(".program-name");
  const sourceInput = node.querySelector(".program-source");
  const urlInput = node.querySelector(".program-url");
  const textInput = node.querySelector(".program-text");
  const status = node.querySelector(".program-status");
  nameInput.value = program.name || `Program ${programList.children.length + 1}`;
  sourceInput.value = program.sourceType || "catalog";
  urlInput.value = program.url || "";
  textInput.value = program.text || "";
  node.dataset.source = sourceInput.value;
  updateSourceStatus(node);
  sourceInput.addEventListener("change", () => {
    node.dataset.source = sourceInput.value;
    updateSourceStatus(node);
  });
  node.querySelector(".fetch-program").addEventListener("click", async () => {
    await fetchProgramPage(node);
  });
  node.querySelector(".remove-program").addEventListener("click", () => {
    node.remove();
    readProgramsFromDom();
  });
  programList.appendChild(node);
}

function loadDemo() {
  programList.innerHTML = "";
  DEMO_PROGRAMS.forEach(addProgram);
  analyzePrograms();
}

function readProgramsFromDom() {
  state.programs = [...programList.querySelectorAll(".program-editor")]
    .map((node, index) => ({
      id: `program-${index}`,
      name: node.querySelector(".program-name").value.trim() || `Program ${index + 1}`,
      sourceType: node.querySelector(".program-source").value,
      url: node.querySelector(".program-url").value.trim(),
      text: node.querySelector(".program-text").value.trim()
    }))
    .map(program => {
      const pastedUrl = extractFirstUrl(program.text);
      if (!program.url && pastedUrl && normalizeProgramText(program.text).length === 0) {
        return {
          ...program,
          sourceType: "webpage",
          url: pastedUrl,
          text: ""
        };
      }
      return program;
    })
    .map(program => ({
      ...program,
      text: normalizeProgramText(program.sourceType === "webcopy" ? cleanWebsiteCopy(program.text) : program.text)
    }))
    .filter(program => program.text.length > 0 || program.url.length > 0);
}

function extractFirstUrl(text) {
  return text.match(/https?:\/\/\S+/i)?.[0] || "";
}

function tokenize(text) {
  return normalizeProgramText(text)
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .map(token => token.replace(/^-+|-+$/g, ""))
    .filter(token => token.length > 2 && token.length < 28 && !STOP_WORDS.has(token));
}

function normalizeProgramText(text) {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\b\S+@\S+\.\S+\b/g, " ")
    .replace(/\b[a-z]+:\/\/\S+/gi, " ")
    .replace(/[?#][^\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(tokens, min = 1, max = 3) {
  const phrases = [];
  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (!phrase.split(" ").some(word => STOP_WORDS.has(word))) {
        phrases.push(phrase);
      }
    }
  }
  return phrases;
}

function splitSentences(text) {
  return normalizeProgramText(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|[\n\r]+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 20);
}

function findSourceSentence(text, phrase) {
  const words = phrase.split(" ");
  const sentences = splitSentences(text);
  return sentences.find(sentence => {
    const lower = sentence.toLowerCase();
    return words.every(word => lower.includes(word));
  }) || "";
}

function hasSignal(term) {
  const words = term.split(" ");
  if (isUrlLikeTerm(term)) return false;
  if (words.some(word => LOW_SIGNAL_TERMS.has(word))) return false;
  if (words.length === 1 && words[0].length < 5) return false;
  return words.some(word => word.length > 4);
}

function isUrlLikeTerm(term) {
  const compact = term.replace(/\s+/g, "");
  if (/https?|www|html|ubc|ualberta|dotcom|dotca/.test(compact)) return true;
  if (compact.length > 24 && !/[aeiou]{2}/.test(compact)) return true;
  return false;
}

function countTerms(terms) {
  return terms.reduce((counts, term) => {
    counts.set(term, (counts.get(term) || 0) + 1);
    return counts;
  }, new Map());
}

async function analyzePrograms() {
  readProgramsFromDom();
  surveyForm.innerHTML = "";
  matchResults.innerHTML = "";
  state.questions = [];

  await hydrateWebPrograms();

  const analyzablePrograms = state.programs.filter(program => program.text.trim().length > 0);
  if (analyzablePrograms.length !== state.programs.length) {
    state.programs = analyzablePrograms;
  }

  if (state.programs.length < 2) {
    showNotice(featureSummary, "Add at least two program descriptions before analyzing.");
    emptyState.classList.add("is-hidden");
    return;
  }

  const docs = state.programs.map(program => {
    const tokens = tokenize(program.text);
    return {
      ...program,
      tokens,
      terms: countTerms(ngrams(tokens, 1, 4))
    };
  });

  const documentFrequency = new Map();
  docs.forEach(doc => {
    new Set(doc.terms.keys()).forEach(term => {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    });
  });

  state.analysis = docs.map(doc => {
    let scored = [...doc.terms.entries()]
      .map(([term, frequency]) => {
        const phraseLength = term.split(" ").length;
        const df = documentFrequency.get(term) || 0;
        const idf = Math.log((docs.length + 1) / (df + 0.5));
        const uniquenessBoost = df === 1 ? 2.4 : 1;
        const score = frequency * idf * uniquenessBoost * (1 + phraseLength * 0.55);
        return {
          term,
          frequency,
          documentFrequency: df,
          score,
          sentence: findSourceSentence(doc.text, term)
        };
      })
      .filter(item => item.score > 0 && item.term.length > 3 && hasSignal(item.term))
      .sort((a, b) => b.score - a.score);

    const uniqueScored = scored.filter(item => item.documentFrequency === 1);
    if (uniqueScored.length >= 3) scored = uniqueScored;

    return {
      id: doc.id,
      name: doc.name,
      text: doc.text,
      features: buildFeatures(scored)
    };
  });

  renderFeatures();
  buildSurvey();
  emptyState.classList.add("is-hidden");
}

async function hydrateWebPrograms() {
  const editors = [...programList.querySelectorAll(".program-editor")];
  for (const [index, program] of state.programs.entries()) {
    if (program.sourceType !== "webpage" || program.text.trim().length > 0) continue;
    const editor = editors[index];
    if (editor) {
      editor.querySelector(".program-source").value = "webpage";
      editor.querySelector(".program-url").value = program.url;
      editor.dataset.source = "webpage";
      await fetchProgramPage(editor, { silent: true });
    }
  }
  readProgramsFromDom();
}

async function fetchProgramPage(editor, options = {}) {
  const urlInput = editor.querySelector(".program-url");
  const textInput = editor.querySelector(".program-text");
  const nameInput = editor.querySelector(".program-name");
  const status = editor.querySelector(".program-status");
  const url = urlInput.value.trim();

  if (!url) {
    setProgramStatus(status, "Add a URL first.", "error");
    return;
  }

  if (!hasExtractorApi()) {
    setProgramStatus(status, "Website URL fetching only works from the local Node server. Run node server.mjs, open http://localhost:4173, then fetch again.", "error");
    return;
  }

  setProgramStatus(status, "Fetching and cleaning the webpage...", "");
  try {
    const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("The extractor API is not available. Run node server.mjs and open http://localhost:4173.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `The webpage returned ${response.status}.`);
    textInput.value = payload.text || "";
    if (!nameInput.value.trim() && payload.title) nameInput.value = payload.title;
    setProgramStatus(status, `Cleaned ${payload.sectionsKept} program-like sections.`, "ok");
  } catch (error) {
    const fallback = options.silent
      ? "Paste the program description, use Pasted website copy, or run the local server."
      : error.message || "Paste the relevant program text instead.";
    setProgramStatus(status, fallback, "error");
  }
}

function updateSourceStatus(editor) {
  const sourceType = editor.querySelector(".program-source").value;
  const status = editor.querySelector(".program-status");
  editor.dataset.source = sourceType;
  if (sourceType === "webpage") {
    const message = hasExtractorApi()
      ? "Fetch the page to extract program details before analysis."
      : "Website URL fetching requires the local server: run node server.mjs and open http://localhost:4173.";
    setProgramStatus(status, message, hasExtractorApi() ? "" : "error");
  } else if (sourceType === "webcopy") {
    setProgramStatus(status, "Navigation and marketing boilerplate will be filtered before analysis.", "");
  } else {
    setProgramStatus(status, "Catalog text uses the pasted details as-is.", "");
  }
}

function hasExtractorApi() {
  return location.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function setProgramStatus(status, message, tone) {
  status.textContent = message;
  status.classList.toggle("is-error", tone === "error");
  status.classList.toggle("is-ok", tone === "ok");
}

function cleanWebsiteCopy(text) {
  const boilerplate = [
    "about", "academic calendar", "admissions", "apply now", "campus", "contact",
    "cookie", "copyright", "donate", "events", "facebook", "financial aid",
    "footer", "instagram", "login", "menu", "news", "privacy", "request information",
    "search", "share", "site map", "skip to content", "social", "twitter", "youtube"
  ];

  return splitSentences(normalizeProgramText(text))
    .filter(sentence => {
      const lower = sentence.toLowerCase();
      if (sentence.length < 35) return false;
      if (boilerplate.some(term => lower === term || lower.startsWith(`${term} `))) return false;
      return hasProgramSignal(lower);
    })
    .join(" ");
}

function hasProgramSignal(text) {
  return [
    "career", "capstone", "concentration", "course", "curriculum", "degree",
    "design", "field", "internship", "lab", "learn", "learning outcome",
    "major", "minor", "project", "research", "skill", "student", "study",
    "target", "training", "work placement"
  ].some(term => text.includes(term));
}

function buildFeatures(scoredTerms) {
  const picked = [];
  const usedWords = new Set();
  const usedLabels = new Set();

  for (const item of scoredTerms) {
    const words = item.term.split(" ");
    const overlap = words.filter(word => usedWords.has(word)).length / words.length;
    const studentText = toStudentFeature(item.term, item.sentence);
    if (overlap > 0.45 || usedLabels.has(studentText)) continue;

    picked.push({
      phrase: item.term,
      score: item.score,
      sourceSentence: item.sentence,
      studentText,
      keywords: words.slice(0, 5)
    });
    words.forEach(word => usedWords.add(word));
    usedLabels.add(studentText);
    if (picked.length === 6) break;
  }

  return picked;
}

function toStudentFeature(phrase, sourceSentence = "") {
  const lower = phrase.toLowerCase();
  const categories = [
    { match: ["lab", "laboratory", "experiment", "biotechnology"], text: "doing hands-on lab experiments" },
    { match: ["health", "medical", "disease", "anatomy", "genetics"], text: "learning how science can improve human health" },
    { match: ["design", "websites", "animation", "visual", "branding"], text: "creating visual or digital designs" },
    { match: ["video", "podcast", "media", "storytelling"], text: "telling stories with digital media" },
    { match: ["climate", "environmental", "water", "land", "policy"], text: "solving environmental problems" },
    { match: ["community", "justice", "neighborhoods", "public"], text: "working on real problems in a community" },
    { match: ["business", "market", "sales", "startup", "revenue"], text: "building and testing business ideas" },
    { match: ["budgeting", "financial", "customer", "pitch"], text: "making practical decisions about money and customers" },
    { match: ["team", "teams", "clients", "present"], text: "working with other people and presenting your ideas" }
  ];

  if (sourceSentence && sourceSentence.length < 150) return simplifySentence(sourceSentence);
  const category = categories.find(item => item.match.some(word => lower.includes(word)));
  if (category) return category.text;
  if (/ing\b/.test(lower.split(" ")[0])) return phrase;
  if (phrase.split(" ").length > 1) return phrase;
  return `learning about ${phrase}`;
}

function simplifySentence(sentence) {
  return sentence
    .replace(/^students\s+(will\s+)?/i, "")
    .replace(/^the program\s+(includes|focuses on|offers)\s+/i, "")
    .replace(/^this program\s+(includes|focuses on|offers)\s+/i, "")
    .replace(/\.$/, "")
    .trim()
    .toLowerCase();
}

function renderFeatures() {
  featureSummary.innerHTML = "";
  state.analysis.forEach(program => {
    const card = document.createElement("article");
    card.className = "feature-card";
    const featureList = program.features.length
      ? program.features.map(feature => `
      <li class="feature-item">
        <strong>${escapeHtml(feature.studentText)}</strong>
        <div class="keyword-row">
          ${feature.keywords.map(keyword => `<span class="keyword">${escapeHtml(keyword)}</span>`).join("")}
        </div>
        ${feature.sourceSentence ? `<p>${escapeHtml(feature.sourceSentence)}</p>` : ""}
      </li>
    `).join("")
      : `<li class="feature-item"><strong>No strong unique component found.</strong><p>Try pasting more specific text, such as courses, outcomes, internships, projects, labs, or concentrations.</p></li>`;

    card.innerHTML = `
      <header>
        <h3>${escapeHtml(program.name)}</h3>
        <span class="score-pill">${program.features.length} items</span>
      </header>
      <ul class="feature-list">${featureList}</ul>
    `;
    featureSummary.appendChild(card);
  });
}

function buildSurvey() {
  if (!state.analysis.length) {
    showNotice(surveyForm, "Analyze programs before building the survey.");
    return;
  }

  state.questions = [];
  if (includeLikert.checked) addLikertQuestions();
  if (includeForced.checked) addForcedQuestions();
  renderSurvey();
}

function addLikertQuestions() {
  state.analysis.forEach(program => {
    program.features.slice(0, 4).forEach(feature => {
      state.questions.push({
        type: "likert",
        programId: program.id,
        prompt: `I would enjoy ${feature.studentText}.`,
        feature: feature.studentText
      });
    });
  });
}

function addForcedQuestions() {
  const maxRounds = Math.min(5, Math.max(...state.analysis.map(program => program.features.length)));
  for (let round = 0; round < maxRounds; round += 1) {
    const options = state.analysis
      .map(program => {
        const feature = program.features[round % program.features.length];
        return feature ? {
          programId: program.id,
          programName: program.name,
          label: capitalize(feature.studentText),
          feature: feature.studentText
        } : null;
      })
      .filter(Boolean);

    if (options.length >= 2) {
      state.questions.push({
        type: "forced",
        prompt: "Which activity sounds most like something you would choose?",
        options
      });
    }
  }
}

function renderSurvey() {
  surveyForm.innerHTML = "";
  if (!state.questions.length) {
    showNotice(surveyForm, "Turn on Likert, forced choice, or both.");
    return;
  }

  state.questions.forEach((question, index) => {
    const card = document.createElement("article");
    card.className = "question-card";

    if (question.type === "likert") {
      card.innerHTML = `
        <fieldset>
          <legend>${index + 1}. ${escapeHtml(question.prompt)}</legend>
          <div class="answer-grid">
            ${[1, 2, 3, 4, 5].map(value => `
              <label class="answer-option">
                <input type="radio" name="q${index}" value="${value}" data-program-id="${question.programId}">
                <span>${likertLabel(value)}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
      `;
    } else {
      card.innerHTML = `
        <fieldset>
          <legend>${index + 1}. ${escapeHtml(question.prompt)}</legend>
          <div class="answer-grid forced">
            ${question.options.map(option => `
              <label class="answer-option">
                <input type="radio" name="q${index}" value="${option.programId}" data-program-id="${option.programId}">
                <span>${escapeHtml(option.label)}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
      `;
    }

    surveyForm.appendChild(card);
  });

  const button = document.createElement("button");
  button.className = "primary-button";
  button.type = "button";
  button.textContent = "Score match";
  button.addEventListener("click", scoreSurvey);
  surveyForm.appendChild(button);
}

function scoreSurvey() {
  const scores = new Map(state.analysis.map(program => [program.id, 0]));
  const maxScores = new Map(state.analysis.map(program => [program.id, 0]));

  state.questions.forEach((question, index) => {
    const answer = surveyForm.querySelector(`input[name="q${index}"]:checked`);
    if (question.type === "likert") {
      maxScores.set(question.programId, (maxScores.get(question.programId) || 0) + 5);
      if (answer) {
        scores.set(question.programId, (scores.get(question.programId) || 0) + Number(answer.value));
      }
    } else {
      question.options.forEach(option => {
        maxScores.set(option.programId, (maxScores.get(option.programId) || 0) + 3);
      });
      if (answer) {
        scores.set(answer.dataset.programId, (scores.get(answer.dataset.programId) || 0) + 3);
      }
    }
  });

  const ranked = state.analysis
    .map(program => {
      const raw = scores.get(program.id) || 0;
      const max = maxScores.get(program.id) || 1;
      return {
        ...program,
        raw,
        percent: Math.round((raw / max) * 100)
      };
    })
    .sort((a, b) => b.percent - a.percent);

  renderMatches(ranked);
  switchView("match");
}

function renderMatches(ranked) {
  matchResults.innerHTML = "";
  ranked.forEach((program, index) => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.innerHTML = `
      <header>
        <h3>${index + 1}. ${escapeHtml(program.name)}</h3>
        <span class="score-pill">${program.percent}%</span>
      </header>
      <div class="match-meter" aria-hidden="true"><span style="width: ${program.percent}%"></span></div>
      <p>Your answers lined up with these parts of the program:</p>
      <ol>
        ${program.features.slice(0, 3).map(feature => `<li>${escapeHtml(capitalize(feature.studentText))}</li>`).join("")}
      </ol>
    `;
    matchResults.appendChild(card);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function loadItemBank(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(reader.result);
    const headers = rows.shift() || [];
    state.itemBank = rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
    const majors = new Set(state.itemBank.map(item => item.major).filter(Boolean));
    itemBankStatus.textContent = `${state.itemBank.length} items, ${majors.size} programs`;
  };
  reader.readAsText(file);
}

function switchView(viewName) {
  document.querySelectorAll(".segment").forEach(button => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("is-active", view.id === `${viewName}View`);
  });
}

function showNotice(container, message) {
  container.innerHTML = `<div class="notice">${escapeHtml(message)}</div>`;
}

function likertLabel(value) {
  return ["No", "Small no", "Not sure", "Small yes", "Yes"][value - 1];
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

addProgram({ name: "Program 1", text: "" });
addProgram({ name: "Program 2", text: "" });

addProgramBtn.addEventListener("click", () => addProgram());
loadDemoBtn.addEventListener("click", loadDemo);
analyzeBtn.addEventListener("click", analyzePrograms);
buildSurveyBtn.addEventListener("click", buildSurvey);
itemBankInput.addEventListener("change", event => {
  const [file] = event.target.files;
  if (file) loadItemBank(file);
});

document.querySelectorAll(".segment").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});
