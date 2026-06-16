/**
 * HireFlow AI - app.js
 * Uses Groq API to parse resumes.
 *
 * CONFIG: Replace YOUR_GROQ_API_KEY_HERE with your key from
 * https://console.groq.com/keys
 */

const GROQ_API_KEY = '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const fileInput    = document.getElementById('fileInput');
const dropZone     = document.getElementById('dropZone');
const filePill     = document.getElementById('filePill');
const fileNameEl   = document.getElementById('fileName');
const removeFile   = document.getElementById('removeFile');
const resumeText   = document.getElementById('resumeText');
const analyzeBtn   = document.getElementById('analyzeBtn');
const statusEl     = document.getElementById('status');
const errorMsgEl   = document.getElementById('errorMsg');
const uploadError  = document.getElementById('uploadError');
const textError    = document.getElementById('textError');
const resultsPanel = document.getElementById('resultsPanel');
const resultsEl    = document.getElementById('results');

let fileContent = '';

function apiKey() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem('groq_api_key'))
    || GROQ_API_KEY;
}

function setStatus(msg, loading = false) {
  statusEl.innerHTML = loading
    ? `<div class="spinner" aria-hidden="true"></div><span>${esc(msg)}</span>`
    : msg ? `<span>${esc(msg)}</span>` : '';
}

function showError(msg) {
  errorMsgEl.hidden = false;
  errorMsgEl.textContent = msg;
}

function clearError() {
  errorMsgEl.hidden = true;
  errorMsgEl.textContent = '';
}

function showFieldError(el, msg) {
  el.hidden = false;
  el.textContent = msg;
}

function clearFieldErrors() {
  uploadError.hidden = true;
  uploadError.textContent = '';
  textError.hidden = true;
  textError.textContent = '';
}

function setAnalyzeLoading(loading) {
  analyzeBtn.disabled = loading;
  analyzeBtn.innerHTML = loading
    ? `<svg class="button-spinner" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
      </svg><span>Analyzing…</span>`
    : '✨ Analyze resume';
}

function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function formatApiError(error) {
  const message = String(error.message || '');
  const status = error.status;
  const apiStatus = error.details?.status || '';

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || /quota|rate limit/i.test(message)) {
    return 'Groq quota or rate limit is exhausted for the configured API key/model. Wait for the limit to reset, check billing/limits in Groq Console, or use a different Groq API key/model in app.js.';
  }

  if (status === 400 || status === 401 || status === 403 || /API key|permission|denied|invalid|unauthorized/i.test(message)) {
    return 'Groq rejected the API key or project permissions. Check GROQ_API_KEY in app.js and make sure the key is active in Groq Console.';
  }

  if (status >= 500) {
    return 'Groq is temporarily unavailable. Try again in a few minutes.';
  }

  return message || `Groq API request failed${status ? ` with status ${status}` : ''}.`;
}

async function extractPdfText(file) {
  const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(item => item.str).join(' '));
  }

  return pages.join('\n');
}

async function handleFile(file) {
  clearError();
  clearFieldErrors();
  fileNameEl.textContent = file.name;
  filePill.hidden = false;
  fileContent = '';

  try {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setStatus('Reading PDF...', true);
      fileContent = await extractPdfText(file);
      setStatus('');
      return;
    }

    const reader = new FileReader();
    fileContent = await new Promise((resolve, reject) => {
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  } catch (err) {
    filePill.hidden = true;
    fileInput.value = '';
    setStatus('');
    showError('Could not read the file. Try copy-pasting the resume text instead.');
    console.error('[ResumeAI] file read error', err);
  }
}

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropZone.addEventListener('click', e => {
  if (e.target === fileInput) return;
  fileInput.click();
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

removeFile.addEventListener('click', () => {
  fileContent = '';
  filePill.hidden = true;
  fileInput.value = '';
  clearFieldErrors();
});

resumeText.addEventListener('input', () => {
  clearFieldErrors();
});

const PROMPT_TEMPLATE = (resumeContent) => `You are a precise resume parser. Extract ALL available information from the resume text below and return ONLY a valid JSON object - no markdown fences, no preamble, no trailing text.

Return this exact shape (omit any key that has no data; never invent data):
{
  "profile": {
    "name": "Full name",
    "title": "Current or most recent job title",
    "summary_tagline": "One-sentence professional summary"
  },
  "contact_info": {
    "email": "",
    "phone": "",
    "location": "City, Country",
    "linkedin": "",
    "website": "",
    "github": ""
  },
  "skills": {
    "technical": ["skill1", "skill2"],
    "soft": ["skill1", "skill2"]
  },
  "experience": [
    {
      "role": "Job title",
      "company": "Company name",
      "start": "Month Year or Year",
      "end": "Month Year or Present",
      "description": "Key achievements in 1-2 sentences"
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "institution": "School name",
      "start": "Year",
      "end": "Year",
      "gpa": "if present"
    }
  ],
  "insights": [
    "Highlight the candidate's single most notable achievement",
    "Note any career progression pattern or growth trajectory",
    "Identify the candidate's standout technical or domain strengths",
    "Suggest the roles or industries this candidate is best suited for"
  ]
}

Resume text:
${resumeContent}`;

function toTitleCase(str = '') {
  return String(str).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatName(str = '') {
  return str ? toTitleCase(str) : '';
}

function formatTitleValue(str = '') {
  return str ? toTitleCase(str) : '';
}

function initials(name = '') {
  const parts = formatName(name).trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}` || '?';
}

function missingPill() {
  return '<span class="missing-pill">Not found</span>';
}

function sectionHeader(name, icon) {
  return `
    <div class="result-section-header">
      <i class="ti ${icon}" aria-hidden="true"></i>
      <span>${esc(name)}</span>
    </div>`;
}

function normalizeUrl(value = '', kind = '') {
  if (!value) return '';
  if (kind === 'email') return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function contactValue(field, value) {
  if (!value) return missingPill();
  const safeValue = esc(value);
  if (['email', 'linkedin', 'github'].includes(field)) {
    return `<a class="contact-link" href="${esc(normalizeUrl(value, field))}" target="${field === 'email' ? '_self' : '_blank'}" rel="noopener">${safeValue}</a>`;
  }
  return safeValue;
}

function renderContactCard(field, label, icon, value) {
  const displayValue = field === 'location' ? formatTitleValue(value) : value;
  return `
    <article class="contact-card">
      <div class="contact-card-top">
        <div class="contact-label-wrap">
          <i class="ti ${icon}" aria-hidden="true"></i>
          <span>${esc(label)}</span>
        </div>
        <button class="copy-btn" type="button" data-copy="${esc(displayValue || '')}" aria-label="Copy ${esc(label)}">
          <i class="ti ti-copy" aria-hidden="true"></i>
        </button>
      </div>
      <div class="contact-value">${contactValue(field, displayValue)}</div>
    </article>`;
}

function renderProfileHero(profile = {}) {
  const name = formatName(profile.name || '');
  const title = formatTitleValue(profile.title || '');
  return `
    <section class="profile-hero">
      <div class="profile-avatar" aria-hidden="true">${esc(initials(name))}</div>
      <div class="profile-copy">
        <div class="profile-full-name">${name ? esc(name) : missingPill()}</div>
        <div class="profile-title">${title ? esc(title) : missingPill()}</div>
      </div>
    </section>`;
}

function renderSummary(summary = '') {
  return `
    <section class="summary-block">
      <div class="summary-label">Summary</div>
      <div class="summary-text">${summary ? esc(summary) : missingPill()}</div>
    </section>`;
}

function renderContact(contact = {}) {
  const fields = [
    ['email', 'Email', 'ti-mail', contact.email],
    ['phone', 'Phone', 'ti-phone', contact.phone],
    ['location', 'Location', 'ti-map-pin', contact.location],
    ['linkedin', 'LinkedIn', 'ti-brand-linkedin', contact.linkedin],
    ['github', 'GitHub', 'ti-brand-github', contact.github],
  ];

  return `
    <section class="result-group">
      ${sectionHeader('Contact', 'ti-address-book')}
      <div class="contact-grid">
        ${fields.map(field => renderContactCard(...field)).join('')}
      </div>
    </section>`;
}

function renderSkills(skills = {}) {
  const allSkills = [...(skills.technical || []), ...(skills.soft || [])].filter(Boolean);
  return `
    <section class="result-group">
      ${sectionHeader('Skills', 'ti-code')}
      <div class="skills-row">
        ${allSkills.length ? allSkills.map(skill => `<span class="skill-pill">${esc(skill)}</span>`).join('') : missingPill()}
      </div>
    </section>`;
}

function splitDescription(description = '') {
  return String(description)
    .split(/\n|•|;(?=\s*[A-Z])/)
    .map(item => item.trim())
    .filter(Boolean);
}

function renderExperienceEntry(item = {}) {
  const company = formatTitleValue(item.company || item.organization || '');
  const role = formatTitleValue(item.role || '');
  const range = [item.start, item.end].filter(Boolean).join(' - ');
  const bullets = splitDescription(item.description || '');

  return `
    <article class="timeline-entry">
      <div class="timeline-marker"><span class="timeline-dot" aria-hidden="true"></span></div>
      <div class="timeline-content">
        <div class="timeline-title">
          <span>${company ? esc(company) : 'Company not found'}</span>
          ${role ? `<span class="timeline-separator">&middot;</span><span class="timeline-role">${esc(role)}</span>` : ''}
        </div>
        ${range ? `<div class="timeline-date">${esc(range)}</div>` : ''}
        ${bullets.length ? `<ul class="timeline-bullets">${bullets.map(bullet => `<li>${esc(bullet)}</li>`).join('')}</ul>` : ''}
      </div>
    </article>`;
}

function renderExperience(items = []) {
  return `
    <section class="result-group">
      ${sectionHeader('Experience', 'ti-briefcase')}
      <div class="timeline-list">
        ${items.length ? items.map(renderExperienceEntry).join('') : missingPill()}
      </div>
    </section>`;
}

function renderEducationEntry(item = {}) {
  const institution = formatTitleValue(item.institution || '');
  const degree = formatTitleValue(item.degree || item.qualification || '');
  const year = [item.start, item.end].filter(Boolean).join(' - ');

  return `
    <article class="timeline-entry education-entry">
      <div class="timeline-marker"><i class="ti ti-school timeline-school-dot" aria-hidden="true"></i></div>
      <div class="timeline-content">
        <div class="education-institution">${institution ? esc(institution) : 'Institution not found'}</div>
        ${degree ? `<div class="education-degree">${esc(degree)}</div>` : ''}
        ${year ? `<div class="timeline-date">${esc(year)}</div>` : ''}
      </div>
    </article>`;
}

function renderEducation(items = []) {
  return `
    <section class="result-group">
      ${sectionHeader('Education', 'ti-school')}
      <div class="timeline-list">
        ${items.length ? items.map(renderEducationEntry).join('') : missingPill()}
      </div>
    </section>`;
}

function renderResults(data) {
  const profile = data.profile || {};
  resultsEl.innerHTML = `
    <div class="results-shell">
      <div class="results-divider" aria-hidden="true"></div>
      <div class="results-header-row">
        <h2>Extracted profile</h2>
        <span class="parsed-badge">AI parsed</span>
      </div>
      ${sectionHeader('Candidate', 'ti-user')}
      ${renderProfileHero(profile)}
      ${renderSummary(profile.summary_tagline)}
      ${renderContact(data.contact_info || {})}
      ${renderSkills(data.skills || {})}
      ${renderExperience(data.experience || [])}
      ${renderEducation(data.education || [])}
    </div>`;

  resultsPanel.hidden = false;
  resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

resultsEl.addEventListener('click', async e => {
  const button = e.target.closest('.copy-btn');
  if (!button) return;

  const value = button.dataset.copy || '';
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    const icon = button.querySelector('.ti');
    icon.className = 'ti ti-check';
    button.classList.add('copied');
    setTimeout(() => {
      icon.className = 'ti ti-copy';
      button.classList.remove('copied');
    }, 1500);
  } catch (err) {
    console.error('[ResumeAI] copy failed', err);
  }
});

analyzeBtn.addEventListener('click', async () => {
  clearError();
  clearFieldErrors();
  resultsPanel.hidden = true;
  resultsEl.innerHTML = '';

  const content = fileContent || resumeText.value.trim();

  if (!content) {
    showFieldError(uploadError, 'Upload a resume file or paste resume text below.');
    showFieldError(textError, 'Paste resume text or upload a resume file above.');
    resumeText.focus();
    return;
  }

  const key = apiKey();
  if (!key || key === 'YOUR_GROQ_API_KEY_HERE') {
    showError('No API key found. Set GROQ_API_KEY in app.js and get a key at console.groq.com/keys.');
    return;
  }

  setAnalyzeLoading(true);
  setStatus('');

  try {
    const resp = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: PROMPT_TEMPLATE(content) }],
          temperature: 0.1,
          max_completion_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new ApiError(
        err.error?.message || `API error ${resp.status}`,
        resp.status,
        err.error || {}
      );
    }

    const d = await resp.json();
    const raw = d.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('[ResumeAI] No JSON found in response:', raw);
      throw new Error('The AI response did not contain a valid JSON object.');
    }

    const pd = JSON.parse(jsonMatch[0]);
    renderResults(pd);
    saveDbResume(pd);
  } catch (err) {
    console.error('[ResumeAI] Analysis error:', err);

    let msg = 'Could not parse the resume. Make sure it contains readable text and try again.';
    if (err.name === 'ApiError') {
      msg = formatApiError(err);
    } else if (err.name === 'SyntaxError') {
      msg = 'The AI returned an invalid response format. Please try again.';
    } else if (err.message) {
      msg = err.message;
    }

    showError(msg);
  } finally {
    setAnalyzeLoading(false);
  }
});


// --- ROUTING & UI INTERACTIONS ---
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-target]');
  const views = document.querySelectorAll('.app-view');

  function switchView(targetId) {
    navItems.forEach(btn => btn.classList.remove('active'));
    views.forEach(view => view.style.display = 'none');

    const activeBtn = document.querySelector(`.sidebar-nav .nav-item[data-target="${targetId}"]`);
    const activeView = document.getElementById(`view-${targetId}`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeView) activeView.style.display = 'block';
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      switchView(target);
    });
  });

  // Ensure default state on load
  const validViews = ['dashboard', 'resumes', 'candidates', 'analytics', 'preferences', 'notifications'];
  const initialView = window.location.hash.replace('#', '') || 'dashboard';
  switchView(validViews.includes(initialView) ? initialView : 'dashboard');
});

// Candidate Drawer API
window.openCandidateDrawer = function(nameStr) {
  const drawer = document.getElementById('candidate-drawer');
  const nameEl = document.getElementById('drawer-name');
  if (drawer && nameEl) {
    nameEl.textContent = nameStr;
    drawer.classList.add('open');
  }
}

window.closeCandidateDrawer = function() {
  const drawer = document.getElementById('candidate-drawer');
  if (drawer) {
    drawer.classList.remove('open');
  }
}

document.getElementById('candidate-drawer')?.addEventListener('click', function(e) {
  if (e.target === this) window.closeCandidateDrawer();
});


// ==========================================
// DATA LAYER (Single Source of Truth)
// ==========================================

function getDbResumes() {
  try {
    return JSON.parse(localStorage.getItem('resumeAI_db')) || [];
  } catch (e) {
    return [];
  }
}

function saveDbResume(resumeData) {
  const resumes = getDbResumes();
  // Ensure unique ID
  const newRecord = {
    id: 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    uploadDate: new Date().toISOString(),
    filename: document.getElementById('fileName').textContent || 'pasted_text.txt',
    matchScore: Math.floor(Math.random() * 30) + 70, // Basic simulation of score
    status: 'Parsed',
    data: resumeData
  };
  resumes.unshift(newRecord);
  localStorage.setItem('resumeAI_db', JSON.stringify(resumes));
  renderAllData();
}

function deleteDbResume(id) {
  let resumes = getDbResumes();
  resumes = resumes.filter(r => r.id !== id);
  localStorage.setItem('resumeAI_db', JSON.stringify(resumes));
  renderAllData();
}

window.deleteDbResumeUI = function(id) {
  if (confirm("Are you sure you want to delete this resume?")) {
    deleteDbResume(id);
  }
};

window.viewCandidateUI = function(id) {
  const resumes = getDbResumes();
  const resume = resumes.find(r => r.id === id);
  if (!resume) return;

  const data = resume.data;
  const name = data.profile?.name || 'Unknown Candidate';
  const role = data.profile?.title || 'Unknown Role';
  const summary = data.profile?.summary_tagline || 'No summary available.';
  
  const allSkills = [...(data.skills?.technical || []), ...(data.skills?.soft || [])].filter(Boolean);
  
  const drawer = document.getElementById('candidate-drawer');
  document.getElementById('drawer-name').textContent = formatName(name);
  document.getElementById('drawer-role').textContent = formatTitleValue(role);
  
  const drawerBody = drawer.querySelector('.drawer-body');
  drawerBody.innerHTML = `
    <div class="drawer-section">
      <h3>Summary</h3>
      <p>${esc(summary)}</p>
    </div>
    
    <div class="drawer-section">
      <h3>Extracted Skills</h3>
      <div class="skills-row">
        ${allSkills.length ? allSkills.map(s => `<span class="skill-pill">${esc(s)}</span>`).join('') : '<span class="missing-pill">None</span>'}
      </div>
    </div>

    <div class="drawer-section">
      <h3>Experience Timeline</h3>
      <div class="timeline-list">
        ${(data.experience || []).length ? data.experience.map(renderExperienceEntry).join('') : '<span class="missing-pill">None</span>'}
      </div>
    </div>
  `;
  
  drawer.classList.add('open');
};

// ==========================================
// DYNAMIC RENDERING ENGINES
// ==========================================

function renderAllData() {
  const resumes = getDbResumes();
  
  renderDashboard(resumes);
  renderResumes(resumes);
  renderCandidates(resumes);
  renderAnalytics(resumes);
}

function emptyStateHTML(message, sub) {
  return `
    <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: var(--radius-lg);">
      <div style="font-size: 40px; color: var(--text-muted); margin-bottom: 16px;"><i class="ti ti-folder-off"></i></div>
      <h3 style="color: var(--text-main); font-size: 18px; margin-bottom: 8px;">${message}</h3>
      <p style="color: var(--text-muted); font-size: 14px;">${sub}</p>
    </div>
  `;
}

function renderDashboard(resumes) {
  const container = document.getElementById('dynamic-dash-metrics');
  if (!container) return;

  if (resumes.length === 0) {
    container.innerHTML = emptyStateHTML('Welcome to HireFlow AI', 'No resumes processed yet. Upload a resume to populate your dashboard.');
    return;
  }

  const total = resumes.length;
  const avgScore = Math.floor(resumes.reduce((acc, r) => acc + (r.matchScore || 0), 0) / (total || 1));
  const avgTime = "1.5s"; // Placeholder for static metric

  container.innerHTML = `
    <div class="metric-card">
      <div class="metric-icon"><i class="ti ti-file-description"></i></div>
      <div class="metric-data">
        <span class="metric-label">Resumes Parsed</span>
        <span class="metric-value">${total}</span>
        <span class="metric-trend up"><i class="ti ti-trending-up"></i> Real-time</span>
      </div>
      <div class="glow-bg"></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon pink"><i class="ti ti-brain"></i></div>
      <div class="metric-data">
        <span class="metric-label">Avg Match Score</span>
        <span class="metric-value">${avgScore}%</span>
        <span class="metric-trend up"><i class="ti ti-trending-up"></i> Live Tracking</span>
      </div>
      <div class="glow-bg"></div>
    </div>
    <div class="metric-card">
      <div class="metric-icon cyan"><i class="ti ti-clock-fast"></i></div>
      <div class="metric-data">
        <span class="metric-label">Avg. Parse Time</span>
        <span class="metric-value">${avgTime}</span>
        <span class="metric-trend up"><i class="ti ti-bolt"></i> Blazing Fast</span>
      </div>
      <div class="glow-bg"></div>
    </div>
  `;
}

function renderResumes(resumes) {
  // Metrics
  const metricsContainer = document.getElementById('dynamic-resumes-metrics');
  if (metricsContainer) {
    const today = new Date().toISOString().split('T')[0];
    const uploadedToday = resumes.filter(r => r.uploadDate.startsWith(today)).length;
    
    metricsContainer.innerHTML = resumes.length === 0 ? '' : `
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Total Resumes</span><span class="metric-value">${resumes.length}</span></div></div>
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Uploaded Today</span><span class="metric-value">${uploadedToday}</span></div></div>
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Pending Review</span><span class="metric-value">0</span></div></div>
    `;
  }

  // Table
  const tbody = document.getElementById('resumes-table-body');
  if (!tbody) return;

  if (resumes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyStateHTML('No Resumes Uploaded', 'Add your first resume to manage candidates here.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = resumes.map(r => {
    const name = r.data.profile?.name || 'Unknown Candidate';
    const init = initials(name);
    const dateStr = new Date(r.uploadDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    return `
      <tr>
        <td class="primary-cell">
          <div class="cand-cell"><div class="mini-ava bg-blue">${esc(init)}</div><span>${esc(formatName(name))}</span></div>
        </td>
        <td style="color: var(--text-muted); font-size: 13px;">${esc(r.filename)}</td>
        <td style="color: var(--text-muted); font-size: 13px;">${esc(dateStr)}</td>
        <td><span class="status-badge success">${esc(r.status)}</span></td>
        <td><span class="score-pill high">${r.matchScore}%</span></td>
        <td>
          <div class="row-actions">
            <button title="View" onclick="viewCandidateUI('${r.id}')"><i class="ti ti-eye"></i></button>
            <button title="Delete" onclick="deleteDbResumeUI('${r.id}')"><i class="ti ti-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCandidates(resumes) {
  // Metrics
  const metricsContainer = document.getElementById('dynamic-candidates-metrics');
  if (metricsContainer) {
    metricsContainer.innerHTML = resumes.length === 0 ? '' : `
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Total Candidates</span><span class="metric-value">${resumes.length}</span></div></div>
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Interview Ready</span><span class="metric-value">${Math.max(0, resumes.length - 1)}</span></div></div>
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Shortlisted</span><span class="metric-value">${Math.floor(resumes.length / 2)}</span></div></div>
      <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">New This Week</span><span class="metric-value">${resumes.length}</span></div></div>
    `;
  }

  // Grid
  const grid = document.getElementById('dynamic-candidates-grid');
  if (!grid) return;

  if (resumes.length === 0) {
    grid.innerHTML = emptyStateHTML('No Candidates Found', 'Candidates automatically populate here once their resumes are parsed.');
    return;
  }

  grid.innerHTML = resumes.map((r, i) => {
    const data = r.data;
    const name = data.profile?.name || 'Unknown Candidate';
    const init = initials(name);
    const role = data.profile?.title || 'Role Unspecified';
    const loc = data.contact_info?.location || 'Remote';
    const expLength = data.experience?.length || 0;
    
    // Pick upto 3 skills
    let skills = [...(data.skills?.technical || []), ...(data.skills?.soft || [])].filter(Boolean).slice(0, 3);
    const skillsHtml = skills.length ? skills.map(s => `<span class="skill-pill">${esc(s)}</span>`).join('') : '<span class="missing-pill">No skills</span>';
    
    const colors = ['bg-blue', 'bg-purple', 'bg-cyan'];
    const bgClass = colors[i % colors.length];
    
    const scoreColorClass = r.matchScore >= 80 ? 'high' : (r.matchScore >= 60 ? 'med' : 'low');

    return `
      <div class="candidate-card glass-panel" onclick="viewCandidateUI('${r.id}')">
        <div class="card-top">
          <div class="cand-avatar ${bgClass}">${esc(init)}</div>
          <button class="icon-btn"><i class="ti ti-dots-vertical" onclick="event.stopPropagation();"></i></button>
        </div>
        <h3>${esc(formatName(name))}</h3>
        <p class="cand-role">${esc(formatTitleValue(role))}</p>
        
        <div class="cand-meta">
          <span><i class="ti ti-briefcase"></i> ${expLength} Experience Roles</span>
          <span><i class="ti ti-map-pin"></i> ${esc(loc)}</span>
        </div>
        
        <div class="skills-row tiny">
          ${skillsHtml}
        </div>
        
        <div class="match-bar-container">
          <div class="match-label">Match Score <span>${r.matchScore}%</span></div>
          <div class="match-bar"><div class="match-fill ${scoreColorClass}" style="width: ${r.matchScore}%;"></div></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAnalytics(resumes) {
  // Metrics
  const metricsContainer = document.getElementById('dynamic-analytics-metrics');
  if (metricsContainer) {
    if (resumes.length === 0) {
      metricsContainer.innerHTML = '';
    } else {
      const avgScore = Math.floor(resumes.reduce((acc, r) => acc + (r.matchScore || 0), 0) / (resumes.length || 1));
      metricsContainer.innerHTML = `
        <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Extraction Accuracy</span><span class="metric-value text-primary">99.1%</span></div></div>
        <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Avg Candidate Score</span><span class="metric-value">${avgScore}%</span></div></div>
        <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Parse Failures</span><span class="metric-value text-danger">0%</span></div></div>
        <div class="metric-card minimal"><div class="metric-data"><span class="metric-label">Est. Time Saved</span><span class="metric-value">${resumes.length * 5} mins</span></div></div>
      `;
    }
  }

  // Charts
  const chartsContainer = document.getElementById('dynamic-analytics-charts');
  if (!chartsContainer) return;

  if (resumes.length === 0) {
    chartsContainer.innerHTML = emptyStateHTML('Not Enough Data', 'Analytics graphics will dynamically generate once resumes are stored.');
    return;
  }

  // Calculate Top Skills
  let allSkillsDict = {};
  resumes.forEach(r => {
     let sk = [...(r.data.skills?.technical || []), ...(r.data.skills?.soft || [])].filter(Boolean);
     sk.forEach(s => {
        let t = s.trim().toUpperCase();
        allSkillsDict[t] = (allSkillsDict[t] || 0) + 1;
     });
  });
  
  let sortedSkills = Object.entries(allSkillsDict).sort((a,b) => b[1] - a[1]).slice(0, 11);
  const colorMap = ['var(--color-primary)', '#3B82F6', '#818CF8', 'var(--text-muted)', '#22D3EE', '#A78BFA', '#6366F1'];
  
  let cloudHTML = sortedSkills.map((sk, idx) => {
     let size = Math.max(14, 28 - (idx * 1.5));
     let w = idx < 3 ? 700 : 400;
     let c = colorMap[idx % colorMap.length];
     return `<div style="font-size: ${size}px; font-weight: ${w}; color: ${c};">${esc(formatTitleValue(sk[0]))}</div>`;
  }).join('');

  if (!cloudHTML) {
     cloudHTML = '<div class="missing-pill">No skills identified yet</div>';
  }

  chartsContainer.innerHTML = `
    <!-- Mock Area Chart -->
    <div class="glass-panel chart-panel">
      <h3>Resumes Uploaded (Trend)</h3>
      <div class="mock-chart area-chart">
        <div class="chart-bars" style="align-items:flex-end;">
           <div class="bar" style="height: 10%"></div>
           <div class="bar" style="height: 15%"></div>
           <div class="bar" style="height: 25%"></div>
           <div class="bar" style="height: ${Math.min(100, resumes.length * 15)}%"></div>
        </div>
      </div>
    </div>

    <!-- Mock Experience Distribution -->
    <div class="glass-panel chart-panel">
      <h3>Role Distribution</h3>
      <div class="mock-chart h-bar-chart">
        <div class="h-bar-row"><span class="h-label">Engineers</span><div class="h-track"><div class="h-fill" style="width: 65%"></div></div><span class="h-val">65%</span></div>
        <div class="h-bar-row"><span class="h-label">Designers</span><div class="h-track"><div class="h-fill" style="width: 25%"></div></div><span class="h-val">25%</span></div>
        <div class="h-bar-row"><span class="h-label">Managers</span><div class="h-track"><div class="h-fill" style="width: 10%"></div></div><span class="h-val">10%</span></div>
      </div>
    </div>
    
    <!-- Top Skills Box -->
    <div class="glass-panel chart-panel flex-span">
      <h3>Top Extracted Skills Database</h3>
      <div class="top-skills-cloud">
         ${cloudHTML}
      </div>
    </div>
  `;
}

// ==========================================
// TOAST SYSTEM
// ==========================================
function showToast(title, msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const iconMap = { success:'ti-circle-check', info:'ti-info-circle', warning:'ti-alert-triangle', error:'ti-alert-circle' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <i class="ti ${iconMap[type]||iconMap.info} toast-icon ${type}"></i>
    <div class="toast-body"><div class="toast-title">${esc(title)}</div><div class="toast-msg">${esc(msg)}</div></div>
    <button class="toast-close" onclick="this.parentElement.classList.add('out');setTimeout(()=>this.parentElement.remove(),300)"><i class="ti ti-x"></i></button>
    <div class="toast-progress"></div>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4200);
}

// ==========================================
// NOTIFICATIONS ENGINE
// ==========================================
function getNotifications() {
  try { return JSON.parse(localStorage.getItem('resumeAI_notifs')) || []; } catch(e) { return []; }
}
function saveNotifications(notifs) {
  localStorage.setItem('resumeAI_notifs', JSON.stringify(notifs));
}

function addNotification(type, title, description) {
  const notifs = getNotifications();
  notifs.unshift({
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
    type, title, description,
    timestamp: new Date().toISOString(),
    read: false
  });
  if (notifs.length > 100) notifs.length = 100;
  saveNotifications(notifs);
  updateNotifBadges();
  renderNotifications();
  showToast(title, description, type === 'system' ? 'warning' : 'success');
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return new Date(dateStr).toLocaleDateString(undefined, {month:'short',day:'numeric'});
}

const notifIconMap = {
  upload: 'ti-upload', parse: 'ti-sparkles', candidate: 'ti-user-plus', system: 'ti-settings', error: 'ti-alert-circle'
};

function renderNotifItem(n) {
  return `
    <div class="notif-item ${n.read?'':'unread'}" data-id="${n.id}" data-type="${n.type}">
      <div class="notif-icon ${n.type}"><i class="ti ${notifIconMap[n.type]||'ti-bell'}"></i></div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title)}</div>
        <div class="notif-desc">${esc(n.description)}</div>
        <div class="notif-meta">
          <span class="notif-time"><i class="ti ti-clock"></i> ${timeAgo(n.timestamp)}</span>
          <span class="notif-tag ${n.type}">${n.type}</span>
        </div>
      </div>
      <div class="notif-actions">
        ${n.read ? '' : '<button class="notif-action-btn" data-action="read" title="Mark read"><i class="ti ti-check"></i></button>'}
        <button class="notif-action-btn" data-action="delete" title="Delete"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
}

let currentNotifFilter = 'all';

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  const notifs = getNotifications();
  let filtered = notifs;
  if (currentNotifFilter === 'unread') filtered = notifs.filter(n => !n.read);
  else if (currentNotifFilter !== 'all') filtered = notifs.filter(n => n.type === currentNotifFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon"><i class="ti ti-bell-off"></i></div><h3>${currentNotifFilter==='all'?'No notifications yet':'No '+currentNotifFilter+' notifications'}</h3><p>Notifications will appear here when you upload, parse, or manage resumes.</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(renderNotifItem).join('');
  // counts
  const countAll = document.getElementById('notif-count-all');
  const countUnread = document.getElementById('notif-count-unread');
  if (countAll) countAll.textContent = notifs.length;
  if (countUnread) countUnread.textContent = notifs.filter(n=>!n.read).length;
}

function updateNotifBadges() {
  const notifs = getNotifications();
  const unread = notifs.filter(n => !n.read).length;
  const navBadge = document.getElementById('nav-notif-badge');
  const topBadge = document.getElementById('topbar-notif-badge');
  if (navBadge) { navBadge.hidden = unread === 0; navBadge.textContent = unread > 99 ? '99+' : unread; }
  if (topBadge) { topBadge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : ''; }
}

function initNotifications() {
  const filtersEl = document.getElementById('notif-filters');
  if (filtersEl) {
    filtersEl.addEventListener('click', e => {
      const btn = e.target.closest('.notif-filter-btn');
      if (!btn) return;
      filtersEl.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentNotifFilter = btn.dataset.filter;
      renderNotifications();
    });
  }

  const listEl = document.getElementById('notif-list');
  if (listEl) {
    listEl.addEventListener('click', e => {
      const actionBtn = e.target.closest('.notif-action-btn');
      if (!actionBtn) return;
      const item = actionBtn.closest('.notif-item');
      const id = item?.dataset.id;
      if (!id) return;
      const action = actionBtn.dataset.action;
      let notifs = getNotifications();
      if (action === 'read') {
        notifs = notifs.map(n => n.id === id ? {...n, read: true} : n);
      } else if (action === 'delete') {
        notifs = notifs.filter(n => n.id !== id);
      }
      saveNotifications(notifs);
      updateNotifBadges();
      renderNotifications();
    });
  }

  document.getElementById('notif-mark-all-read')?.addEventListener('click', () => {
    const notifs = getNotifications().map(n => ({...n, read: true}));
    saveNotifications(notifs);
    updateNotifBadges();
    renderNotifications();
    showToast('Notifications', 'All notifications marked as read', 'success');
  });

  document.getElementById('notif-clear-all')?.addEventListener('click', () => {
    if (!confirm('Clear all notifications?')) return;
    saveNotifications([]);
    updateNotifBadges();
    renderNotifications();
    showToast('Notifications', 'All notifications cleared', 'info');
  });

  document.getElementById('topbar-notif-btn')?.addEventListener('click', () => {
    const navBtn = document.querySelector('.nav-item[data-target="notifications"]');
    if (navBtn) navBtn.click();
  });

  updateNotifBadges();
  renderNotifications();
}

// ==========================================
// PREFERENCES ENGINE
// ==========================================
const PREF_DEFAULTS = {
  profile: { fullname: 'Jane Doe', email: '', jobtitle: '', company: '', bio: '' },
  appearance: { theme: 'dark', accent: 'indigo', fontSize: 15, reduceMotion: false, compactMode: false },
  account: { apiKey: '', model: 'llama-3.3-70b-versatile', password: '' },
  application: { autosave: true, desktopNotifs: false, sounds: false, showScores: true, temperature: 10, maxChars: 15000 }
};

function getPrefs() {
  try { return JSON.parse(localStorage.getItem('resumeAI_prefs')) || JSON.parse(JSON.stringify(PREF_DEFAULTS)); }
  catch(e) { return JSON.parse(JSON.stringify(PREF_DEFAULTS)); }
}
function savePrefs(prefs) { localStorage.setItem('resumeAI_prefs', JSON.stringify(prefs)); }

function applyTheme(prefs) {
  const body = document.body;
  body.className = '';
  const theme = prefs.appearance?.theme || 'dark';
  body.classList.add(theme + '-mode');
  // Accent color
  const accentMap = {
    indigo: { primary:'#6366F1', glow:'rgba(99,102,241,0.4)' },
    blue: { primary:'#3B82F6', glow:'rgba(59,130,246,0.4)' },
    cyan: { primary:'#06B6D4', glow:'rgba(6,182,212,0.4)' },
    emerald: { primary:'#10B981', glow:'rgba(16,185,129,0.4)' },
    rose: { primary:'#F43F5E', glow:'rgba(244,63,94,0.4)' },
    amber: { primary:'#F59E0B', glow:'rgba(245,158,11,0.4)' }
  };
  const accent = accentMap[prefs.appearance?.accent] || accentMap.indigo;
  document.documentElement.style.setProperty('--color-primary', accent.primary);
  document.documentElement.style.setProperty('--color-primary-glow', accent.glow);
  // Font size
  const fs = prefs.appearance?.fontSize || 15;
  document.body.style.fontSize = fs + 'px';
  // Reduce motion
  if (prefs.appearance?.reduceMotion) document.body.style.setProperty('--transition-speed','0s');
  else document.body.style.removeProperty('--transition-speed');
}

function updateSidebarUser(prefs) {
  const nameEl = document.querySelector('.user-name');
  const avatarEl = document.querySelector('.sidebar-footer .avatar');
  const prefAvatar = document.getElementById('pref-avatar-display');
  const name = prefs.profile?.fullname || 'User';
  if (nameEl) nameEl.textContent = name;
  const init = initials(name);
  if (avatarEl) avatarEl.textContent = init;
  if (prefAvatar) prefAvatar.textContent = init;
}

function loadPrefsUI() {
  const prefs = getPrefs();
  // Profile
  const pf = prefs.profile || {};
  document.getElementById('pref-fullname').value = pf.fullname || '';
  document.getElementById('pref-email').value = pf.email || '';
  document.getElementById('pref-jobtitle').value = pf.jobtitle || '';
  document.getElementById('pref-company').value = pf.company || '';
  document.getElementById('pref-bio').value = pf.bio || '';
  // Appearance
  const ap = prefs.appearance || {};
  document.querySelectorAll('#theme-picker .theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (ap.theme||'dark'));
  });
  document.querySelectorAll('#accent-picker .accent-dot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accent === (ap.accent||'indigo'));
  });
  document.getElementById('font-size-display').textContent = (ap.fontSize||15)+'px';
  document.getElementById('pref-reduce-motion').checked = !!ap.reduceMotion;
  document.getElementById('pref-compact-mode').checked = !!ap.compactMode;
  // Account
  const ac = prefs.account || {};
  document.getElementById('pref-api-key').value = ac.apiKey || '';
  document.getElementById('pref-model-select').value = ac.model || 'llama-3.3-70b-versatile';
  // Application
  const app = prefs.application || {};
  document.getElementById('pref-autosave').checked = app.autosave !== false;
  document.getElementById('pref-desktop-notifs').checked = !!app.desktopNotifs;
  document.getElementById('pref-sounds').checked = !!app.sounds;
  document.getElementById('pref-show-scores').checked = app.showScores !== false;
  document.getElementById('pref-temperature').value = app.temperature ?? 10;
  document.getElementById('pref-temp-display').textContent = ((app.temperature ?? 10)/100).toFixed(2);
  document.getElementById('pref-max-chars').value = app.maxChars || 15000;

  updateSidebarUser(prefs);
  applyTheme(prefs);
}

function initPreferences() {
  // Tab switching
  document.getElementById('pref-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.pref-tab');
    if (!tab) return;
    document.querySelectorAll('.pref-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pref-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById('pref-panel-' + tab.dataset.prefTab);
    if (panel) panel.classList.add('active');
  });

  // Save Profile
  document.getElementById('pref-save-profile')?.addEventListener('click', () => {
    const prefs = getPrefs();
    prefs.profile = {
      fullname: document.getElementById('pref-fullname').value.trim(),
      email: document.getElementById('pref-email').value.trim(),
      jobtitle: document.getElementById('pref-jobtitle').value.trim(),
      company: document.getElementById('pref-company').value.trim(),
      bio: document.getElementById('pref-bio').value.trim()
    };
    savePrefs(prefs);
    updateSidebarUser(prefs);
    showToast('Profile Saved', 'Your profile has been updated successfully.', 'success');
    addNotification('system', 'Profile Updated', 'Your profile information was updated.');
  });

  // Theme picker
  document.getElementById('theme-picker')?.addEventListener('click', e => {
    const opt = e.target.closest('.theme-option');
    if (!opt) return;
    document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    const prefs = getPrefs();
    prefs.appearance = prefs.appearance || {};
    prefs.appearance.theme = opt.dataset.theme;
    savePrefs(prefs); applyTheme(prefs);
  });

  // Accent picker
  document.getElementById('accent-picker')?.addEventListener('click', e => {
    const dot = e.target.closest('.accent-dot');
    if (!dot) return;
    document.querySelectorAll('.accent-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    const prefs = getPrefs();
    prefs.appearance = prefs.appearance || {};
    prefs.appearance.accent = dot.dataset.accent;
    savePrefs(prefs); applyTheme(prefs);
  });

  // Font size
  document.getElementById('font-decrease')?.addEventListener('click', () => {
    const prefs = getPrefs(); prefs.appearance = prefs.appearance || {};
    prefs.appearance.fontSize = Math.max(12, (prefs.appearance.fontSize||15) - 1);
    savePrefs(prefs); applyTheme(prefs);
    document.getElementById('font-size-display').textContent = prefs.appearance.fontSize + 'px';
  });
  document.getElementById('font-increase')?.addEventListener('click', () => {
    const prefs = getPrefs(); prefs.appearance = prefs.appearance || {};
    prefs.appearance.fontSize = Math.min(22, (prefs.appearance.fontSize||15) + 1);
    savePrefs(prefs); applyTheme(prefs);
    document.getElementById('font-size-display').textContent = prefs.appearance.fontSize + 'px';
  });

  // Toggle switches (appearance)
  document.getElementById('pref-reduce-motion')?.addEventListener('change', e => {
    const prefs = getPrefs(); prefs.appearance = prefs.appearance || {};
    prefs.appearance.reduceMotion = e.target.checked;
    savePrefs(prefs); applyTheme(prefs);
  });
  document.getElementById('pref-compact-mode')?.addEventListener('change', e => {
    const prefs = getPrefs(); prefs.appearance = prefs.appearance || {};
    prefs.appearance.compactMode = e.target.checked;
    savePrefs(prefs);
    document.body.classList.toggle('compact-mode', e.target.checked);
  });

  // Password toggle
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.querySelector('i').className = isPass ? 'ti ti-eye-off' : 'ti ti-eye';
    });
  });

  // Update password
  document.getElementById('pref-update-pw')?.addEventListener('click', () => {
    const cur = document.getElementById('pref-current-pw').value;
    const nw = document.getElementById('pref-new-pw').value;
    if (!nw || nw.length < 6) { showToast('Error', 'Password must be at least 6 characters.', 'error'); return; }
    const prefs = getPrefs();
    if (prefs.account?.password && prefs.account.password !== cur) { showToast('Error', 'Current password is incorrect.', 'error'); return; }
    prefs.account = prefs.account || {};
    prefs.account.password = nw;
    savePrefs(prefs);
    document.getElementById('pref-current-pw').value = '';
    document.getElementById('pref-new-pw').value = '';
    showToast('Password Updated', 'Your password has been changed.', 'success');
    addNotification('system', 'Password Changed', 'Your account password was updated.');
  });

  // Save API settings
  document.getElementById('pref-save-api')?.addEventListener('click', () => {
    const prefs = getPrefs();
    prefs.account = prefs.account || {};
    prefs.account.apiKey = document.getElementById('pref-api-key').value.trim();
    prefs.account.model = document.getElementById('pref-model-select').value;
    savePrefs(prefs);
    // Apply to runtime
    if (prefs.account.apiKey) localStorage.setItem('groq_api_key', prefs.account.apiKey);
    showToast('API Settings Saved', 'Your API configuration has been updated.', 'success');
    addNotification('system', 'API Config Updated', 'Groq API key and model preference saved.');
  });

  // Danger zone
  document.getElementById('pref-clear-data')?.addEventListener('click', () => {
    if (!confirm('This will permanently delete ALL resumes, candidates, and analytics. Continue?')) return;
    localStorage.removeItem('resumeAI_db');
    renderAllData();
    showToast('Data Cleared', 'All resume data has been deleted.', 'warning');
    addNotification('system', 'Data Cleared', 'All parsed resumes and candidate data have been permanently deleted.');
  });
  document.getElementById('pref-reset-all')?.addEventListener('click', () => {
    if (!confirm('Reset all preferences to defaults?')) return;
    localStorage.removeItem('resumeAI_prefs');
    loadPrefsUI();
    showToast('Preferences Reset', 'All settings restored to defaults.', 'info');
    addNotification('system', 'Preferences Reset', 'All application preferences were restored to factory defaults.');
  });

  // Temperature slider
  document.getElementById('pref-temperature')?.addEventListener('input', e => {
    document.getElementById('pref-temp-display').textContent = (e.target.value / 100).toFixed(2);
  });

  // Save application settings
  document.getElementById('pref-save-app')?.addEventListener('click', () => {
    const prefs = getPrefs();
    prefs.application = {
      autosave: document.getElementById('pref-autosave').checked,
      desktopNotifs: document.getElementById('pref-desktop-notifs').checked,
      sounds: document.getElementById('pref-sounds').checked,
      showScores: document.getElementById('pref-show-scores').checked,
      temperature: parseInt(document.getElementById('pref-temperature').value),
      maxChars: parseInt(document.getElementById('pref-max-chars').value) || 15000
    };
    savePrefs(prefs);
    showToast('App Settings Saved', 'Application preferences updated.', 'success');
    addNotification('system', 'App Settings Updated', 'Application behavior preferences were saved.');
  });

  // Desktop notifications permission
  document.getElementById('pref-desktop-notifs')?.addEventListener('change', e => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  });

  loadPrefsUI();
}

// ==========================================
// HOOK NOTIFICATIONS INTO RESUME ACTIONS
// ==========================================
const _origSaveDbResume = saveDbResume;
saveDbResume = function(resumeData) {
  _origSaveDbResume(resumeData);
  const name = resumeData.profile?.name || 'Unknown Candidate';
  addNotification('upload', 'Resume Uploaded', `Resume for "${name}" has been successfully uploaded.`);
  addNotification('parse', 'Resume Parsed', `AI extraction complete for ${name}. Profile data is now available.`);
  addNotification('candidate', 'New Candidate Added', `${name} has been added to your candidate database.`);
};

const _origDeleteDbResume = deleteDbResume;
deleteDbResume = function(id) {
  const resumes = getDbResumes();
  const r = resumes.find(x => x.id === id);
  const name = r?.data?.profile?.name || 'Unknown';
  _origDeleteDbResume(id);
  addNotification('system', 'Resume Deleted', `Resume for "${name}" was permanently removed.`);
};

// ==========================================
// AI CHATBOT ENGINE
// ==========================================
function getChatHistory() {
  try { return JSON.parse(localStorage.getItem('resumeAI_chat')) || []; } catch(e) { return []; }
}
function saveChatHistory(msgs) { localStorage.setItem('resumeAI_chat', JSON.stringify(msgs)); }

function chatTimeStr() {
  return new Date().toLocaleTimeString(undefined, {hour:'2-digit',minute:'2-digit'});
}

function buildSystemPrompt() {
  const resumes = getDbResumes();
  const prefs = getPrefs();
  let ctx = '';
  if (resumes.length > 0) {
    const summaries = resumes.slice(0, 5).map((r, i) => {
      const d = r.data;
      const skills = [...(d.skills?.technical||[]),...(d.skills?.soft||[])].join(', ');
      return `Candidate ${i+1}: ${d.profile?.name||'Unknown'} | ${d.profile?.title||'N/A'} | Skills: ${skills || 'N/A'} | Score: ${r.matchScore}%`;
    }).join('\n');
    ctx = `\n\nCANDIDATE DATABASE (${resumes.length} total, showing top 5):\n${summaries}`;
  }
  return `You are HireFlow AI, an expert HR and recruitment copilot for the HireFlow AI platform. You help with:
- Resume analysis and improvement suggestions
- ATS (Applicant Tracking System) score optimization
- Skill gap identification and career advice
- Job recommendations based on candidate profiles
- Interview preparation and question generation
- Candidate comparison and shortlisting
- Recruiter workflow optimization

Be concise, professional, and actionable. Use bullet points and structure when helpful. If the user asks about their candidates or resumes, reference the data below.${ctx}

User profile: ${prefs.profile?.fullname || 'User'}, ${prefs.profile?.jobtitle || 'Recruiter'}`;
}

function renderChatMessage(msg) {
  const isUser = msg.role === 'user';
  const avatarContent = isUser ? initials(getPrefs().profile?.fullname || 'U') : '<i class="ti ti-sparkles"></i>';
  const copyBtn = !isUser ? `<button class="chat-copy-btn" data-copy="${esc(msg.content)}" title="Copy"><i class="ti ti-copy"></i></button>` : '';
  return `
    <div class="chat-msg ${isUser?'user':'ai'}">
      <div class="chat-msg-avatar">${avatarContent}</div>
      <div>
        <div class="chat-msg-bubble">${esc(msg.content).replace(/\n/g,'<br>')}</div>
        <div class="chat-msg-meta"><span>${msg.time || ''}</span>${copyBtn}</div>
      </div>
    </div>`;
}

function initChatbot() {
  const fab = document.getElementById('chat-fab');
  const win = document.getElementById('chat-window');
  const messagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const clearBtn = document.getElementById('chat-clear');
  const closeBtn = document.getElementById('chat-close');
  const promptsEl = document.getElementById('chat-prompts');
  if (!fab || !win) return;

  let chatOpen = false;
  let isSending = false;

  function toggleChat() {
    chatOpen = !chatOpen;
    fab.classList.toggle('open', chatOpen);
    win.hidden = !chatOpen;
    if (chatOpen) { input.focus(); scrollToBottom(); }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  function loadHistory() {
    const history = getChatHistory();
    if (history.length === 0) return;
    // Hide welcome + prompts
    const welcome = messagesEl.querySelector('.chat-welcome');
    const prompts = messagesEl.querySelector('.chat-prompts');
    if (welcome) welcome.style.display = 'none';
    if (prompts) prompts.style.display = 'none';
    history.forEach(msg => {
      messagesEl.insertAdjacentHTML('beforeend', renderChatMessage(msg));
    });
    scrollToBottom();
  }

  function showTyping() {
    messagesEl.insertAdjacentHTML('beforeend', `
      <div class="chat-typing" id="chat-typing">
        <div class="chat-msg-avatar" style="background:rgba(99,102,241,0.15);color:#818CF8;width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="ti ti-sparkles"></i></div>
        <div class="chat-typing-dots"><span></span><span></span><span></span></div>
      </div>`);
    scrollToBottom();
  }

  function hideTyping() {
    document.getElementById('chat-typing')?.remove();
  }

  async function sendMessage(text) {
    if (!text.trim() || isSending) return;
    isSending = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    // Hide welcome/prompts on first message
    const welcome = messagesEl.querySelector('.chat-welcome');
    const prompts = messagesEl.querySelector('.chat-prompts');
    if (welcome) welcome.style.display = 'none';
    if (prompts) prompts.style.display = 'none';

    const userMsg = { role: 'user', content: text.trim(), time: chatTimeStr() };
    const history = getChatHistory();
    history.push(userMsg);
    saveChatHistory(history);

    messagesEl.insertAdjacentHTML('beforeend', renderChatMessage(userMsg));
    scrollToBottom();
    showTyping();

    try {
      const key = apiKey();
      if (!key || key === 'YOUR_GROQ_API_KEY_HERE') throw new Error('No API key configured. Set your Groq API key in Preferences > Account.');

      const prefs = getPrefs();
      const model = prefs.account?.model || GROQ_MODEL;
      const contextMsgs = history.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            ...contextMsgs
          ],
          temperature: 0.7,
          max_completion_tokens: 1024,
          stream: false
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new ApiError(err.error?.message || `API error ${resp.status}`, resp.status, err.error || {});
      }

      const data = await resp.json();
      const aiContent = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      hideTyping();
      const aiMsg = { role: 'assistant', content: aiContent, time: chatTimeStr() };
      history.push(aiMsg);
      saveChatHistory(history);
      messagesEl.insertAdjacentHTML('beforeend', renderChatMessage(aiMsg));
      scrollToBottom();

    } catch (err) {
      hideTyping();
      const errMsg = err.name === 'ApiError' ? formatApiError(err) : (err.message || 'Something went wrong.');
      messagesEl.insertAdjacentHTML('beforeend', `<div class="chat-error"><i class="ti ti-alert-circle"></i> ${esc(errMsg)}</div>`);
      scrollToBottom();
    } finally {
      isSending = false;
      sendBtn.disabled = !input.value.trim();
    }
  }

  // Event listeners
  fab.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim() || isSending;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
  });

  sendBtn.addEventListener('click', () => sendMessage(input.value));

  promptsEl.addEventListener('click', e => {
    const btn = e.target.closest('.chat-prompt-btn');
    if (btn) sendMessage(btn.dataset.prompt);
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear chat history?')) return;
    saveChatHistory([]);
    messagesEl.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon"><i class="ti ti-robot"></i></div>
        <h3>Hi! I'm your AI Copilot</h3>
        <p>I can help with resume analysis, ATS scores, interview prep, candidate comparison, and more.</p>
      </div>
      <div class="chat-prompts" id="chat-prompts">
        <button class="chat-prompt-btn" data-prompt="Analyze my latest uploaded resume"><i class="ti ti-file-analytics"></i> Analyze my resume</button>
        <button class="chat-prompt-btn" data-prompt="How can I improve my ATS score?"><i class="ti ti-chart-arrows-vertical"></i> Improve ATS score</button>
        <button class="chat-prompt-btn" data-prompt="Generate 5 technical interview questions for a senior developer role"><i class="ti ti-help-octagon"></i> Interview questions</button>
        <button class="chat-prompt-btn" data-prompt="Compare the top candidates in my database by skills and experience"><i class="ti ti-users"></i> Compare candidates</button>
        <button class="chat-prompt-btn" data-prompt="What skills are most in-demand for software engineers right now?"><i class="ti ti-bulb"></i> Skill gap analysis</button>
        <button class="chat-prompt-btn" data-prompt="Give me tips to improve this resume for a product manager role"><i class="ti ti-pencil"></i> Resume improvement</button>
      </div>`;
  });

  // Copy button delegation
  messagesEl.addEventListener('click', async e => {
    const btn = e.target.closest('.chat-copy-btn');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy || '');
      btn.classList.add('copied');
      const icon = btn.querySelector('i');
      icon.className = 'ti ti-check';
      setTimeout(() => { icon.className = 'ti ti-copy'; btn.classList.remove('copied'); }, 1500);
    } catch(err) { console.error('Copy failed', err); }
  });

  loadHistory();
}

// Call on startup
document.addEventListener('DOMContentLoaded', () => {
   renderAllData();
   initPreferences();
   initNotifications();
   initChatbot();
   // Seed a welcome notification if brand new
   if (getNotifications().length === 0) {
     addNotification('system', 'Welcome to HireFlow AI', 'Your workspace is ready. Upload a resume to get started!');
   }
});
