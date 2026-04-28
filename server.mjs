import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/extract") {
    await handleExtract(url, response);
    return;
  }

  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, requested === "/" ? "index.html" : requested);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }

  response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`CMPA web app running at http://localhost:${port}`);
});

async function handleExtract(url, response) {
  const target = url.searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(target)) {
    sendJson(response, 400, { error: "Provide a valid http or https URL." });
    return;
  }

  try {
    const page = await fetch(target, {
      headers: {
        "User-Agent": "CMPA Program Preference Tool/0.1"
      }
    });

    if (!page.ok) {
      sendJson(response, page.status, { error: `The webpage returned ${page.status}.` });
      return;
    }

    const html = await page.text();
    const extracted = extractProgramText(html);
    sendJson(response, 200, {
      url: target,
      title: extracted.title,
      text: extracted.text,
      sectionsKept: extracted.sectionsKept
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Could not fetch the webpage." });
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function extractProgramText(html) {
  const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
  const metaDescription = decodeHtml(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1] ||
    ""
  );

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");

  body = body
    .replace(/<\/(h1|h2|h3|h4|p|li|tr|section|article|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = decodeHtml(body)
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const programSignals = [
    "about this program", "admission requirements", "capstone", "career", "careers",
    "concentration", "course", "courses", "curriculum", "degree requirements",
    "field placement", "internship", "learning outcome", "learning outcomes",
    "major requirements", "minor requirements", "overview", "practicum", "program description",
    "program highlights", "program requirements", "research", "students will",
    "study", "target", "who should apply"
  ];

  const junkSignals = [
    "accessibility", "alumni", "apply now", "calendar", "campus map", "contact us",
    "cookie", "copyright", "directory", "donate", "events", "facebook", "financial aid",
    "instagram", "login", "privacy", "request information", "search", "site map",
    "skip to", "twitter", "youtube"
  ];

  const kept = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.length < 35) continue;
    if (junkSignals.some(signal => lower.includes(signal))) continue;
    if (programSignals.some(signal => lower.includes(signal))) kept.push(line);
  }

  const fallback = lines
    .filter(line => line.length >= 45)
    .filter(line => !junkSignals.some(signal => line.toLowerCase().includes(signal)))
    .slice(0, 45);

  const selected = kept.length >= 4 ? kept : fallback;
  const text = [metaDescription, ...selected]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    text,
    sectionsKept: selected.length
  };
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
