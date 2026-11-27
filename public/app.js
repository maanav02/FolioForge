const STORAGE_KEY = 'folioforge-student-portfolio-v1';
const API_BASE = '';
const form = document.getElementById('portfolioForm');
const projectsList = document.getElementById('projectsList');
const projectTemplate = document.getElementById('projectTemplate');
const preview = document.getElementById('portfolioPreview');
const generateBtn = document.getElementById('generateBtn');
const toast = document.getElementById('toast');
let aiContent = null;
let toastTimer;

const fieldIds = ['fullName','headline','course','institution','location','email','aboutNotes','github','linkedin','skills','education','graduationYear','coursework'];

function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function safeWebUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0,2);
  return parts.map(part => part[0].toUpperCase()).join('') || 'YN';
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function setStatus(message, type='info') {
  const status = document.getElementById('apiStatus');
  document.getElementById('apiStatusText').textContent = message;
  status.classList.remove('connected','disconnected');
  if (type === 'connected') status.classList.add('connected');
  if (type === 'disconnected') status.classList.add('disconnected');
}
function getTheme() {
  return document.querySelector('input[name="theme"]:checked')?.value || 'midnight';
}
function collectProjects() {
  return [...projectsList.querySelectorAll('.project-input-card')].map(card => ({
    title: card.querySelector('.project-title')?.value.trim() || '',
    problem: card.querySelector('.project-problem')?.value.trim() || '',
    technologies: card.querySelector('.project-tech')?.value.trim() || '',
    outcome: card.querySelector('.project-outcome')?.value.trim() || '',
    link: card.querySelector('.project-link')?.value.trim() || ''
  })).filter(project => project.title || project.problem || project.technologies || project.outcome || project.link);
}
function collectData() {
  const data = {};
  fieldIds.forEach(id => data[id] = document.getElementById(id).value.trim());
  data.skillsList = data.skills.split(',').map(skill => skill.trim()).filter(Boolean).slice(0,30);
  data.projects = collectProjects();
  data.theme = getTheme();
  return data;
}
function saveDraft() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({data: collectData(), aiContent})); }
  catch (error) { console.warn('Draft could not be saved:', error); }
}
function renderAiEditor() {
  const panel = document.getElementById('aiEditPanel');
  if (!aiContent) { panel.hidden = true; return; }
  panel.hidden = false;
  document.getElementById('generatedHeadline').value = aiContent.headline || '';
  document.getElementById('generatedAbout').value = aiContent.about || '';
  const container = document.getElementById('generatedProjectsEditor');
  container.innerHTML = '';
  (Array.isArray(aiContent.projects) ? aiContent.projects : []).forEach((project, index) => {
    const card = document.createElement('article');
    card.className = 'generated-project-edit';
    const heading = document.createElement('h4');
    heading.textContent = `AI suggestion for project ${index + 1}: ${project.title || 'Untitled project'}`;
    const descriptionLabel = document.createElement('label');
    descriptionLabel.className = 'field';
    const descriptionTitle = document.createElement('span');
    descriptionTitle.textContent = 'Project description';
    const description = document.createElement('textarea');
    description.rows = 3; description.maxLength = 900; description.value = project.description || '';
    description.dataset.projectIndex = String(index); description.dataset.aiField = 'description';
    descriptionLabel.append(descriptionTitle, description);
    const impactLabel = document.createElement('label');
    impactLabel.className = 'field field-spaced';
    const impactTitle = document.createElement('span'); impactTitle.textContent = 'Outcome / learning';
    const impact = document.createElement('input'); impact.maxLength = 300; impact.value = project.impact || '';
    impact.dataset.projectIndex = String(index); impact.dataset.aiField = 'impact';
    impactLabel.append(impactTitle, impact);
    card.append(heading, descriptionLabel, impactLabel);
    container.appendChild(card);
  });
}

function updatePreview() {
  const data = collectData();
  const content = aiContent || {};
  preview.className = `portfolio-preview theme-${data.theme}`;
  document.getElementById('previewAvatar').textContent = initials(data.fullName);
  document.getElementById('previewName').textContent = data.fullName || 'Your Name';
  document.getElementById('previewHeadline').textContent = content.headline || data.headline || 'Your headline will appear here';
  const courseLine = [data.course || data.education, data.institution, data.location].filter(Boolean).join(' · ');
  document.getElementById('previewLocation').textContent = courseLine || 'Add your course and institution to personalise this space.';
  const aboutText = content.about || data.aboutNotes || 'Your introduction will appear here. Add a few notes in the editor, then use Gemini to help shape them into a professional bio.';
  document.getElementById('previewAbout').textContent = aboutText;
  document.getElementById('copyAboutBtn').disabled = !content.about && !data.aboutNotes;
  const linkItems = [];
  const github = safeWebUrl(data.github), linkedin = safeWebUrl(data.linkedin);
  if (github) linkItems.push(`<a href="${escapeHtml(github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>`);
  if (linkedin) linkItems.push(`<a href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>`);
  if (data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) linkItems.push(`<a href="mailto:${escapeHtml(data.email)}">Email ↗</a>`);
  document.getElementById('previewLinks').innerHTML = linkItems.join('');

  const skills = data.skillsList;
  document.getElementById('previewSkills').innerHTML = skills.length
    ? skills.map(skill => `<span>${escapeHtml(skill)}</span>`).join('')
    : '<span class="empty-chip">Your skills</span>';

  const generatedProjects = Array.isArray(content.projects) ? content.projects : [];
  const projectCards = data.projects.map((project, index) => {
    const generated = generatedProjects[index] || {};
    const description = generated.description || project.problem || 'Add a short explanation of this project.';
    const impact = generated.impact || project.outcome;
    const tech = project.technologies;
    const link = safeWebUrl(project.link);
    return `<article class="preview-project-card"><h3>${escapeHtml(project.title || generated.title || `Project ${index+1}`)}</h3><p>${escapeHtml(description)}</p>${tech ? `<small>TOOLS · ${escapeHtml(tech)}</small>` : ''}${impact ? `<small>LEARNING / OUTCOME · ${escapeHtml(impact)}</small>` : ''}${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View project ↗</a>` : ''}</article>`;
  }).join('');
  document.getElementById('previewProjects').innerHTML = projectCards || '<div class="empty-project"><span>✦</span><p>Your projects will appear here once you add them.</p></div>';

  const education = data.education || data.course || 'Your education';
  const year = data.graduationYear ? ` · Expected graduation ${data.graduationYear}` : '';
  document.getElementById('previewEducation').textContent = `${education}${year}`;
  const coursework = [data.institution, data.coursework].filter(Boolean).join(' · ');
  document.getElementById('previewCoursework').textContent = coursework || 'Your learning areas can appear here.';
  document.getElementById('previewFooterName').textContent = data.fullName ? `${data.fullName} · Student portfolio` : 'Made with FolioForge';
  document.getElementById('previewYear').textContent = new Date().getFullYear();
  saveDraft();
}
function addProject(values={}) {
  const existing = projectsList.querySelectorAll('.project-input-card').length;
  if (existing >= 4) { showToast('You can add up to four projects.'); return; }
  const fragment = projectTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.project-input-card');
  card.querySelector('.project-title').value = values.title || '';
  card.querySelector('.project-problem').value = values.problem || '';
  card.querySelector('.project-tech').value = values.technologies || '';
  card.querySelector('.project-outcome').value = values.outcome || '';
  card.querySelector('.project-link').value = values.link || '';
  projectsList.appendChild(fragment);
  refreshProjectLabels();
  updatePreview();
}
function refreshProjectLabels() {
  const cards = [...projectsList.querySelectorAll('.project-input-card')];
  cards.forEach((card, index) => {
    card.querySelector('.project-input-head b').textContent = `Project ${index+1}`;
    card.querySelector('.remove-project').disabled = cards.length === 1;
  });
}
function populateData(data={}) {
  fieldIds.forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = data[id] || ''; });
  const theme = data.theme || 'midnight';
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
  if (radio) radio.checked = true;
  projectsList.innerHTML = '';
  const projects = Array.isArray(data.projects) && data.projects.length ? data.projects.slice(0,4) : [{}];
  projects.forEach(project => addProject(project));
  refreshProjectLabels();
  renderAiEditor();
  updatePreview();
}
function sampleData() {
  return {
    fullName:'Aarav Mehta', headline:'First-year B.Tech CSE student · Aspiring software developer', course:'B.Tech Computer Science & Engineering', institution:'ITM Skills University', location:'Mumbai, India', email:'aarav@example.com', aboutNotes:'I am a first-year computer science student learning programming and web development. I enjoy building small projects, exploring artificial intelligence and improving my problem-solving skills. I am looking for opportunities to learn, collaborate and gain practical experience.', github:'https://github.com/', linkedin:'https://www.linkedin.com/', skills:'HTML, CSS, Python basics, Git, Problem Solving', education:'B.Tech Computer Science & Engineering', graduationYear:'2030', coursework:'Programming fundamentals, web development, introduction to AI', theme:'midnight', projects:[{title:'Student Management System',problem:'A simple web application concept to organise student records and make it easier to add, view and update student information.',technologies:'HTML, CSS, JavaScript',outcome:'Practised form design, user interface structure and basic data organisation.',link:''},{title:'Personal Portfolio Website',problem:'A responsive website to introduce myself and present my skills, projects and learning journey.',technologies:'HTML, CSS',outcome:'Learned page layout, responsive styling and content organisation.',link:''}]
  };
}
async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error('Health check failed');
    const result = await response.json();
    if (result.aiConfigured) setStatus(`Gemini connected · ${result.model}`, 'connected');
    else setStatus('AI setup needed · preview is available', 'disconnected');
  } catch {
    setStatus('Start the local server to use AI', 'disconnected');
  }
}
function buildPromptPayload(data) {
  return {
    profile: {
      fullName: data.fullName, headline: data.headline, course: data.course,
      institution: data.institution, location: data.location, aboutNotes: data.aboutNotes,
      skills: data.skillsList, education: data.education, graduationYear: data.graduationYear,
      coursework: data.coursework
    },
    projects: data.projects.map(project => ({title:project.title, problem:project.problem, technologies:project.technologies, outcome:project.outcome}))
  };
}
async function generateWithAI() {
  const data = collectData();
  if (!data.fullName) { showToast('Please enter your name first.'); document.getElementById('fullName').focus(); return; }
  if (!data.aboutNotes && !data.projects.length && !data.headline && !data.skillsList.length) {
    showToast('Add some profile notes, skills or a project before generating.'); return;
  }
  const originalText = generateBtn.innerHTML;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span> Generating…';
  setStatus('Sending selected details to Gemini…');
  try {
    const response = await fetch(`${API_BASE}/api/generate-portfolio`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(buildPromptPayload(data))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    aiContent = result.content;
    renderAiEditor();
    updatePreview();
    setStatus(`AI content generated · ${result.model || 'Gemini'}`, 'connected');
    showToast('AI suggestions added. Review them before publishing.');
  } catch (error) {
    setStatus('AI unavailable · manual preview still works', 'disconnected');
    showToast(error.message || 'Could not generate content. Check the server and API key.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalText;
  }
}
function buildExportHtml(data) {
  const content = aiContent || {};
  const about = content.about || data.aboutNotes || '';
  const headline = content.headline || data.headline || data.course || 'Student portfolio';
  const projects = data.projects.map((project,index) => {
    const generated = content.projects?.[index] || {};
    const link = safeWebUrl(project.link);
    return `<article class="project"><h2>${escapeHtml(project.title || generated.title || `Project ${index+1}`)}</h2><p>${escapeHtml(generated.description || project.problem || '')}</p>${project.technologies ? `<small>Tools: ${escapeHtml(project.technologies)}</small>` : ''}${(generated.impact || project.outcome) ? `<small>Outcome: ${escapeHtml(generated.impact || project.outcome)}</small>` : ''}${link ? `<p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View project ↗</a></p>` : ''}</article>`;
  }).join('');
  const skills = data.skillsList.map(skill => `<span>${escapeHtml(skill)}</span>`).join('');
  const links = [safeWebUrl(data.github) ? `<a href="${escapeHtml(safeWebUrl(data.github))}" target="_blank" rel="noopener noreferrer">GitHub</a>` : '', safeWebUrl(data.linkedin) ? `<a href="${escapeHtml(safeWebUrl(data.linkedin))}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : '', data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ? `<a href="mailto:${escapeHtml(data.email)}">Email</a>` : ''].filter(Boolean).join('');
  const themeCss = data.theme === 'paper' ? 'background:#f7f8fc;color:#172236;--muted:#58657b;--line:#e4e8f0;--accent:#5b62b8;--card:#fff;' : 'background:#0e1524;color:#eef2fb;--muted:#aab7cc;--line:#29364c;--accent:#b49aff;--card:#151f31;';
  const education = [data.education || data.course, data.institution, data.graduationYear ? `Expected graduation: ${data.graduationYear}` : '', data.coursework].filter(Boolean).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(data.fullName)} — student portfolio"><title>${escapeHtml(data.fullName)} | Portfolio</title><style>*{box-sizing:border-box}body{margin:0;${themeCss}font:16px/1.7 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{width:min(900px,92%);margin:auto}.hero{text-align:center;padding:88px 20px 58px;border-bottom:1px solid var(--line)}.kicker{font-size:11px;letter-spacing:2px;color:var(--accent);font-weight:700}.avatar{width:76px;height:76px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(140deg,#b49aff,#79b8ff);color:#11182a;font-weight:800;font-size:24px;margin:22px auto 16px}h1{font-size:clamp(34px,7vw,58px);line-height:1.1;letter-spacing:-2px;margin:0}.headline{color:var(--accent);margin:12px 0 4px}.meta{color:var(--muted);font-size:13px}.links{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:22px}.links a,a{color:var(--accent)}.links a{border:1px solid var(--line);border-radius:7px;padding:5px 11px;text-decoration:none;font-size:13px}.section{padding:32px 0;border-bottom:1px solid var(--line)}.label{font-size:11px;letter-spacing:2px;color:var(--accent);font-weight:700}.section>p{color:var(--muted);white-space:pre-wrap}.skills{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.skills span{background:var(--card);border:1px solid var(--line);padding:5px 11px;border-radius:7px;font-size:13px}.project{padding:20px;border:1px solid var(--line);background:var(--card);border-radius:12px;margin-top:14px}.project h2{font-size:19px;margin:0 0 8px}.project p{color:var(--muted);margin:6px 0}.project small{display:block;color:var(--muted);margin-top:5px}footer{padding:25px 0;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}@media print{body{print-color-adjust:exact}}</style></head><body><main class="wrap"><header class="hero"><div class="kicker">STUDENT PORTFOLIO</div><div class="avatar">${escapeHtml(initials(data.fullName))}</div><h1>${escapeHtml(data.fullName || 'Your Name')}</h1><p class="headline">${escapeHtml(headline)}</p><div class="meta">${escapeHtml([data.course,data.institution,data.location].filter(Boolean).join(' · '))}</div><div class="links">${links}</div></header><section class="section"><div class="label">ABOUT</div><p>${escapeHtml(about)}</p></section><section class="section"><div class="label">SKILLS</div><div class="skills">${skills || '<span>Add your skills</span>'}</div></section><section class="section"><div class="label">PROJECTS</div>${projects || '<p>No projects added yet.</p>'}</section><section class="section"><div class="label">EDUCATION</div><p>${escapeHtml(education || 'Add your education details.')}</p></section><footer><span>${escapeHtml(data.fullName || 'Student')} · Portfolio</span><span>© ${new Date().getFullYear()}</span></footer></main></body></html>`;
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.getElementById('aiEditPanel').addEventListener('input', event => {
  if (!aiContent) return;
  if (event.target.id === 'generatedHeadline') aiContent.headline = event.target.value;
  if (event.target.id === 'generatedAbout') aiContent.about = event.target.value;
  const index = Number(event.target.dataset.projectIndex);
  const field = event.target.dataset.aiField;
  if (Number.isInteger(index) && field && aiContent.projects?.[index]) aiContent.projects[index][field] = event.target.value;
  updatePreview();
});

function loadSavedDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.data) { aiContent = saved.aiContent || null; populateData(saved.data); }
    else populateData({});
  } catch { populateData({}); }
}

form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);
projectsList.addEventListener('input', updatePreview);
projectsList.addEventListener('click', event => {
  const button = event.target.closest('.remove-project');
  if (!button) return;
  const cards = projectsList.querySelectorAll('.project-input-card');
  if (cards.length <= 1) return;
  button.closest('.project-input-card').remove();
  aiContent = null;
  renderAiEditor();
  refreshProjectLabels();
  updatePreview();
});
document.getElementById('addProjectBtn').addEventListener('click', () => { aiContent = null; renderAiEditor(); addProject(); });
document.getElementById('generateBtn').addEventListener('click', generateWithAI);
document.getElementById('manualPreviewBtn').addEventListener('click', () => { aiContent = null; renderAiEditor(); updatePreview(); showToast('Preview updated using your own wording.'); });
document.getElementById('loadSampleBtn').addEventListener('click', () => { aiContent = null; populateData(sampleData()); showToast('Example profile loaded. Replace it with your own details.'); });
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Clear this portfolio draft from this browser?')) return;
  aiContent = null; localStorage.removeItem(STORAGE_KEY); populateData({}); showToast('Draft cleared.');
});
document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = collectData();
  if (!data.fullName) { showToast('Enter your name before downloading.'); document.getElementById('fullName').focus(); return; }
  downloadFile(`${(data.fullName || 'student').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-portfolio.html`, buildExportHtml(data), 'text/html;charset=utf-8');
  showToast('Portfolio HTML downloaded. Open it in your browser to check it.');
});
document.getElementById('downloadJsonBtn').addEventListener('click', () => {
  const data = collectData();
  downloadFile('folioforge-portfolio-data.json', JSON.stringify({profile:data, aiSuggestions:aiContent}, null, 2), 'application/json');
  showToast('Portfolio data downloaded.');
});
document.getElementById('printBtn').addEventListener('click', () => window.print());
document.getElementById('copyAboutBtn').addEventListener('click', async () => {
  const data = collectData(); const text = aiContent?.about || data.aboutNotes;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); showToast('About section copied.'); }
  catch { showToast('Clipboard access was blocked by the browser.'); }
});

loadSavedDraft();
checkApiHealth();
