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
  "but", "by", "can", "course", "courses", "degree", "department", "do", "does", "doing",
  "during", "each", "for", "from", "further", "had", "has", "have", "having", "he", "her",
  "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself",
  "learn", "learning", "major", "may", "more", "most", "of", "on", "or", "other", "our",
  "out", "over", "own", "program", "programs", "school", "she", "should", "so", "some",
  "student", "students", "study", "such", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "under", "until", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "within", "you", "your"
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
  const textInput = node.querySelector(".program-text");
  nameInput.value = program.name || `Program ${programList.children.length + 1}`;
  textInput.value = program.text || "";
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
      text: node.querySelector(".program-text").value.trim()
    }))
    .filter(program => program.text.length > 0);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(token => token.replace(/^-+|-+$/g, ""))
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
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

function countTerms(terms) {
  return terms.reduce((counts, term) => {
    counts.set(term, (counts.get(term) || 0) + 1);
    return counts;
  }, new Map());
}

function analyzePrograms() {
  readProgramsFromDom();
  surveyForm.innerHTML = "";
  matchResults.innerHTML = "";
  state.questions = [];

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
      terms: countTerms(ngrams(tokens, 1, 3))
    };
  });

  const documentFrequency = new Map();
  docs.forEach(doc => {
    new Set(doc.terms.keys()).forEach(term => {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    });
  });

  state.analysis = docs.map(doc => {
    const scored = [...doc.terms.entries()]
      .map(([term, frequency]) => {
        const phraseLength = term.split(" ").length;
        const idf = Math.log((docs.length + 1) / ((documentFrequency.get(term) || 0) + 0.5));
        const score = frequency * idf * (1 + phraseLength * 0.35);
        return { term, frequency, score };
      })
      .filter(item => item.score > 0 && item.term.length > 3)
      .sort((a, b) => b.score - a.score);

    return {
      id: doc.id,
      name: doc.name,
      text: doc.text,
      features: buildFeatures(scored, doc.text, doc.name)
    };
  });

  renderFeatures();
  buildSurvey();
  emptyState.classList.add("is-hidden");
}

function buildFeatures(scoredTerms, text, programName) {
  const picked = [];
  const usedWords = new Set();

  for (const item of scoredTerms) {
    const words = item.term.split(" ");
    const tooSimilar = words.some(word => usedWords.has(word));
    if (tooSimilar && picked.length >= 3) continue;
    picked.push({
      phrase: item.term,
      score: item.score,
      studentText: toStudentFeature(item.term, text, programName),
      keywords: words.slice(0, 4)
    });
    words.forEach(word => usedWords.add(word));
    if (picked.length === 6) break;
  }

  return picked;
}

function toStudentFeature(phrase, text) {
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
    { match: ["research", "data", "analysis", "surveys"], text: "using evidence and data to answer questions" },
    { match: ["team", "teams", "clients", "present"], text: "working with other people and presenting your ideas" }
  ];

  const category = categories.find(item => item.match.some(word => lower.includes(word) || text.toLowerCase().includes(word)));
  if (category) return category.text;
  return `learning about ${phrase}`;
}

function renderFeatures() {
  featureSummary.innerHTML = "";
  state.analysis.forEach(program => {
    const card = document.createElement("article");
    card.className = "feature-card";
    const featureList = program.features.map(feature => `
      <li class="feature-item">
        <strong>${escapeHtml(feature.studentText)}</strong>
        <div class="keyword-row">
          ${feature.keywords.map(keyword => `<span class="keyword">${escapeHtml(keyword)}</span>`).join("")}
        </div>
      </li>
    `).join("");

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
