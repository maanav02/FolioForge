import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '80kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait a few minutes and try again.' }
});

function text(value, maxLength = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
function sanitiseInput(body) {
  const profile = body?.profile || {};
  const projects = Array.isArray(body?.projects) ? body.projects.slice(0, 4) : [];
  return {
    profile: {
      fullName: text(profile.fullName, 80),
      headline: text(profile.headline, 100),
      course: text(profile.course, 100),
      institution: text(profile.institution, 120),
      location: text(profile.location, 80),
      aboutNotes: text(profile.aboutNotes, 1200),
      skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 30).map(item => text(item, 50)).filter(Boolean) : [],
      education: text(profile.education, 140),
      graduationYear: text(profile.graduationYear, 10),
      coursework: text(profile.coursework, 300)
    },
    projects: projects.map(project => ({
      title: text(project?.title, 100),
      problem: text(project?.problem, 500),
      technologies: text(project?.technologies, 180),
      outcome: text(project?.outcome, 300)
    })).filter(project => project.title || project.problem || project.technologies || project.outcome)
  };
}
function extractJson(output) {
  const cleaned = String(output || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { /* try to extract the first JSON object */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('The AI response was not valid JSON. Please try again.');
}
function cleanGeneratedContent(raw, projectCount) {
  const safeString = value => typeof value === 'string' ? value.trim().slice(0, 1800) : '';
  const projects = Array.isArray(raw.projects) ? raw.projects.slice(0, projectCount).map(project => ({
    title: safeString(project.title).slice(0, 100),
    description: safeString(project.description).slice(0, 900),
    impact: safeString(project.impact).slice(0, 300)
  })) : [];
  return {
    headline: safeString(raw.headline).slice(0, 120),
    about: safeString(raw.about).slice(0, 1200),
    projects
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ aiConfigured: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
});

app.post('/api/generate-portfolio', generationLimiter, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini is not configured yet. Add GEMINI_API_KEY to your .env file and restart the server.' });
  }

  const data = sanitiseInput(req.body);
  if (!data.profile.fullName) return res.status(400).json({ error: 'Please provide your name before generating portfolio content.' });
  if (!data.profile.aboutNotes && data.projects.length === 0 && !data.profile.headline && data.profile.skills.length === 0) {
    return res.status(400).json({ error: 'Add some profile notes, skills or project details first.' });
  }

  const prompt = `You are a careful professional portfolio editor helping a university student write a truthful portfolio.

TASK
Improve the supplied student information so it is clear, professional, concise and beginner-friendly. Do not exaggerate the student's ability or experience.

STRICT ACCURACY RULES
- Use only facts provided in the input.
- Never invent degrees, marks, certificates, employers, internships, awards, project results, links or technical skills.
- Do not change a beginner skill into an expert-level claim.
- If a detail is missing, leave it out rather than guessing.
- Keep the tone confident but realistic for a student or early-career applicant.
- Do not include private personal information beyond the fields supplied.
- Preserve each project title and its order. Provide one generated project object per supplied project.
- For project descriptions, explain the problem and what the student says they built or practised. Do not invent measurable outcomes.

OUTPUT FORMAT
Return ONLY a valid JSON object. Do not add Markdown fences or commentary. Use exactly this structure:
{
  "headline": "A concise portfolio headline, maximum 100 characters",
  "about": "A professional first-person About section, approximately 70-120 words",
  "projects": [
    {"title": "Original project title", "description": "Clear project description, 35-70 words", "impact": "Outcome or learning stated by the student, or an empty string if none was supplied"}
  ]
}

STUDENT DATA
${JSON.stringify(data, null, 2)}
`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: prompt,
      store: false
    });
    const parsed = extractJson(interaction.output_text);
    const content = cleanGeneratedContent(parsed, data.projects.length);
    if (!content.about && !content.headline) throw new Error('The AI did not return usable portfolio content. Please try again.');
    res.json({ success: true, content, model: interaction.model || MODEL });
  } catch (error) {
    console.error('Portfolio generation failed:', error?.message || error);
    const message = error?.message || 'AI generation failed. Please try again.';
    const status = /quota|rate|429/i.test(message) ? 429 : 502;
    res.status(status).json({ error: status === 429 ? 'The Gemini API rate limit or quota was reached. Try again later or check your AI Studio usage.' : 'Gemini could not generate the portfolio text. Check your API key/model configuration and try again.' });
  }
});


app.listen(PORT, () => {
  console.log(`FolioForge is running at http://localhost:${PORT}`);
  console.log(`Gemini AI: ${process.env.GEMINI_API_KEY ? `configured (${MODEL})` : 'not configured — manual preview remains available'}`);
});
