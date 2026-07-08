/* ==========================================================================
   Project Kaizen — app.js
   A single global `App` object holds all logic. No other globals are
   created. All data lives in ONE localStorage key: "kaizenDB".
   ========================================================================== */

const App = {

  /* ------------------------------------------------------------------
     0. CONSTANTS
     ------------------------------------------------------------------ */
  STORAGE_KEY: "kaizenDB",
  SUBJECTS: ["Maths","Physics","Chemistry","Biology","History","Geography","English","Hindi","Japanese","Computer","Essay","Projects"],
  HABIT_DEFS: [
    { key: "wake",     label: "Wake before 7" },
    { key: "exercise", label: "Exercise" },
    { key: "meditate", label: "Meditation" },
    { key: "reading",  label: "Reading" },
    { key: "nosocial", label: "No social media" },
    { key: "deepwork", label: "Deep work" },
    { key: "food",     label: "Healthy food" },
    { key: "sleep7",   label: "Sleep 7h+" }
  ],
  QUOTES: [
    "Small steps, every day.",
    "改善 — change for the better, one session at a time.",
    "Discipline is choosing between what you want now and what you want most.",
    "The exam is in the future. Consistency is today.",
    "You don't need more hours, you need more focus.",
    "Progress, not perfection.",
    "Every rep counts, even the ones that feel small.",
    "Study like the exam is tomorrow, rest like it's a year away.",
    "The score reflects the streak, not the sprint.",
    "Slow is smooth. Smooth is fast."
  ],
  SUBJECT_COLORS: {
    Maths:"#c98a4b", Physics:"#6f9bc7", Chemistry:"#7fa361", Biology:"#e0a868",
    History:"#c15c52", Geography:"#5fa7a3", English:"#c67ba0", Hindi:"#d1793f",
    Japanese:"#9b7bc4", Computer:"#5f9e8f", Essay:"#d4b256", Projects:"#a87c9e"
  },

  /* ------------------------------------------------------------------
     1. STATE
     ------------------------------------------------------------------ */
  db: null,           // in-memory copy of kaizenDB
  currentPage: "dashboard",
  calendarViewDate: new Date(), // month currently shown in Calendar page
  cache: {},           // memoized derived values, invalidated on save()
  deferredInstallPrompt: null, // captured 'beforeinstallprompt' event, if any

  /* ------------------------------------------------------------------
     2. INIT
     ------------------------------------------------------------------ */
  init() {
    this.loadDB();
    this.applyTheme();
    this.bindNavigation();
    this.bindGlobalHandlers();
    this.bindInstallPrompt();
    this.bindGalleryHandlers();
    this.applyGalleryVisuals();
    this.renderAll();
    this.registerServiceWorker();
  },

  /* ------------------------------------------------------------------
     3. STORAGE LAYER
     ------------------------------------------------------------------ */
  defaultDB() {
    return {
      sessions: [],
      habits: { logs: {} },
      reviews: { daily: [], weekly: [] },
      planner: {},
      goals: {
        daily: 2, weekly: 14, monthly: 60, yearly: 700,
        subjects: {}
      },
      settings: {
        theme: "dark", accent: "amber",
        reminderTime: "", jlptDate: "", jlptLevel: "N5"
      },
      sleep: { logs: {} },
      immersion: { logs: [] },
      gallery: { banner: "", avatar: "", thumbnails: [] }
    };
  },

  loadDB() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) {
        this.db = this.defaultDB();
        this.persist();
        return;
      }
      const parsed = JSON.parse(raw);
      // Merge with defaults so missing keys never crash the app.
      const def = this.defaultDB();
      this.db = Object.assign({}, def, parsed);
      for (const k of Object.keys(def)) {
        if (this.db[k] == null) this.db[k] = def[k];
      }
      if (!Array.isArray(this.db.sessions)) this.db.sessions = [];
      if (!this.db.goals) this.db.goals = def.goals;
      if (!this.db.goals.subjects) this.db.goals.subjects = {};
      if (!this.db.settings) this.db.settings = def.settings;
      if (!this.db.habits || !this.db.habits.logs) this.db.habits = { logs: {} };
      if (!this.db.reviews) this.db.reviews = { daily: [], weekly: [] };
      if (!this.db.sleep || !this.db.sleep.logs) this.db.sleep = { logs: {} };
      if (!this.db.immersion || !Array.isArray(this.db.immersion.logs)) this.db.immersion = { logs: [] };
      if (!this.db.gallery) this.db.gallery = { banner: "", avatar: "", thumbnails: [] };
      if (!Array.isArray(this.db.gallery.thumbnails)) this.db.gallery.thumbnails = [];
    } catch (err) {
      console.error("Kaizen: failed to load DB, resetting.", err);
      this.db = this.defaultDB();
      this.persist();
    }
  },

  persist() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.db));
      this.cache = {}; // invalidate memoized aggregates
      return true;
    } catch (err) {
      console.error("Kaizen: failed to persist DB.", err);
      this.toast("Storage error — data may not be saved.");
      return false;
    }
  },

  /* ------------------------------------------------------------------
     4. GENERAL UTILITIES
     ------------------------------------------------------------------ */
  $(id) { return document.getElementById(id); },

  setText(id, value) {
    const el = this.$(id);
    if (el) el.textContent = value;
  },

  setHTML(id, html) {
    const el = this.$(id);
    if (el) el.innerHTML = html;
  },

  setWidth(id, pct) {
    const el = this.$(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%";
  },

  uid() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  pad2(n) { return n < 10 ? "0" + n : "" + n; },

  formatDateKey(d) {
    return d.getFullYear() + "-" + this.pad2(d.getMonth() + 1) + "-" + this.pad2(d.getDate());
  },

  parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  },

  getISOWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return date.getUTCFullYear() + "-W" + this.pad2(week);
  },

  getMonthKey(d) { return d.getFullYear() + "-" + this.pad2(d.getMonth() + 1); },
  getYearKey(d) { return "" + d.getFullYear(); },

  minutesToHM(mins) {
    mins = Math.round(mins || 0);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h + "h " + m + "m";
  },

  minutesToHours1(mins) {
    return (Math.round((mins || 0) / 6) / 10); // 1 decimal place hours
  },

  startOfWeek(d) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Monday = 0
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() - day);
    return date;
  },

  daysBetween(a, b) {
    const oneDay = 86400000;
    return Math.round((this.stripTime(b) - this.stripTime(a)) / oneDay);
  },

  stripTime(d) {
    const c = new Date(d);
    c.setHours(0,0,0,0);
    return c;
  },

  toast(msg) {
    const el = this.$("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  },

  /* ------------------------------------------------------------------
     5. NAVIGATION
     ------------------------------------------------------------------ */
  bindNavigation() {
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => this.navigateTo(btn.dataset.page));
    });
    const plannerBack = this.$("planner-back-btn");
    if (plannerBack) plannerBack.addEventListener("click", () => this.navigateTo("goals"));
    const openPlanner = this.$("open-planner-btn");
    if (openPlanner) openPlanner.addEventListener("click", () => this.navigateTo("planner"));
  },

  navigateTo(pageName) {
    if (!pageName) return;
    const pages = document.querySelectorAll(".page");
    pages.forEach(p => p.classList.toggle("active", p.dataset.page === pageName));
    const navButtons = document.querySelectorAll(".nav-btn");
    navButtons.forEach(b => b.classList.toggle("active", b.dataset.page === pageName));
    this.currentPage = pageName;
    const main = this.$("main-content");
    if (main) main.scrollTop = 0;
    this.renderPage(pageName);
  },

  renderAll() {
    this.renderPage("dashboard");
  },

  renderPage(pageName) {
    switch (pageName) {
      case "dashboard": this.renderDashboard(); break;
      case "study": this.renderStudyPage(); break;
      case "history": this.renderHistoryPage(); break;
      case "calendar": this.renderCalendarPage(); break;
      case "analytics": this.renderAnalyticsPage(); break;
      case "habits": this.renderHabitsPage(); break;
      case "japanese": this.renderJapanesePage(); break;
      case "goals": this.renderGoalsPage(); break;
      case "review": this.renderReviewPage(); break;
      case "settings": this.renderSettingsPage(); break;
      case "planner": this.renderPlannerPage(); break;
    }
  },
} else if (stats.weekMin >= weeklyGoalMin) {
        insights.push("You've hit your weekly goal already. Great work!");
      }
    }

    // Streak-based insight
    if (stats.currentStreak >= 7) {
      insights.push(`Streak of ${stats.currentStreak} days — this is becoming a real habit.`);
    } else if (stats.currentStreak === 0 && stats.longestStreak > 0) {
      insights.push("Your streak reset. One focused session today will restart it.");
    }

    return insights.slice(0, 6);
  },

  generatePrediction() {
    const stats = this.getStats();
    if (!stats.totalSessions) return "Log a session to see predictions.";
    const goals = this.db.goals;
    const yearlyGoalMin = (goals.yearly || 0) * 60;
    if (!yearlyGoalMin) return "Set a yearly goal to unlock predictions.";

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const daysElapsed = Math.max(1, this.daysBetween(startOfYear, now) + 1);
    const dailyRate = stats.yearMin / daysElapsed;
    if (dailyRate <= 0) return "Study a bit more to generate a yearly projection.";
    const projectedYearMin = dailyRate * 365;
    const pct = Math.round((projectedYearMin / yearlyGoalMin) * 100);

    if (pct >= 100) {
      return `At your current pace, you're on track to reach ${pct}% of your yearly goal. Excellent trajectory.`;
    } else if (pct >= 80) {
      return `At your current pace, you'll reach about ${pct}% of your yearly goal. Small increases now will close the gap.`;
    } else {
      return `At your current pace, you're projected to reach only ${pct}% of your yearly goal. Consider increasing daily study time.`;
    }
  },

  escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  /* ------------------------------------------------------------------
     9. STUDY LOGGER
     ------------------------------------------------------------------ */
  renderStudyPage() {
    const confirmEl = this.$("save-confirm");
    if (confirmEl) confirmEl.classList.remove("show");
  },

  getSelectedDurationMinutes() {
    const custom = this.$("study-custom");
    if (custom && custom.value && Number(custom.value) > 0) {
      return Math.round(Number(custom.value));
    }
    const selectedChip = document.querySelector("#duration-grid .chip.selected");
    if (selectedChip) return Number(selectedChip.dataset.min);
    return 0;
  },

  saveSession() {
    const subjectEl = this.$("study-subject");
    const focusEl = this.$("study-focus");
    const energyEl = this.$("study-energy");
    const notesEl = this.$("study-notes");
    const minutes = this.getSelectedDurationMinutes();

    if (!minutes) {
      this.toast("Pick a duration or enter a custom one.");
      return;
    }
    const now = new Date();
    const session = {
      id: this.uid(),
      timestamp: now.getTime(),
      date: this.formatDateKey(now),
      week: this.getISOWeekKey(now),
      month: this.getMonthKey(now),
      year: this.getYearKey(now),
      subject: subjectEl ? subjectEl.value : this.SUBJECTS[0],
      minutes: minutes,
      focus: focusEl ? Number(focusEl.value) : null,
      energy: energyEl ? Number(energyEl.value) : null,
      notes: notesEl ? notesEl.value.trim() : ""
    };
    this.db.sessions.push(session);
    this.persist();

    // Reset form
    document.querySelectorAll("#duration-grid .chip").forEach(c => c.classList.remove("selected"));
    if (this.$("study-custom")) this.$("study-custom").value = "";
    if (notesEl) notesEl.value = "";

    const confirmEl = this.$("save-confirm");
    if (confirmEl) {
      confirmEl.textContent = `Saved: ${session.subject} • ${this.minutesToHM(session.minutes)}`;
      confirmEl.classList.add("show");
    }
    this.toast("Session saved");
    this.renderDashboard();
  },

  /* ------------------------------------------------------------------
     10. HISTORY
     ------------------------------------------------------------------ */
  renderHistoryPage() {
    const filterSelect = this.$("history-filter-subject");
    if (filterSelect && filterSelect.options.length <= 1) {
      this.SUBJECTS.forEach(subj => {
        const opt = document.createElement("option");
        opt.value = subj; opt.textContent = subj;
        filterSelect.appendChild(opt);
      });
    }
    this.renderHistoryList();
  },

  renderHistoryList() {
    const container = this.$("history-list");
    if (!container) return;
    const search = (this.$("history-search")?.value || "").toLowerCase();
    const subjectFilter = this.$("history-filter-subject")?.value || "";
    const sortMode = this.$("history-sort")?.value || "newest";

    let sessions = this.db.sessions.filter(s => {
      if (subjectFilter && s.subject !== subjectFilter) return false;
      if (search && !(s.notes || "").toLowerCase().includes(search)) return false;
      return true;
    });
    sessions.sort((a, b) => sortMode === "newest" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);

    if (!sessions.length) {
      container.innerHTML = '<div class="empty-state">No sessions found.</div>';
      return;
    }

    const MAX_RENDER = 200; // avoid rendering huge DOM lists at once
    const shown = sessions.slice(0, MAX_RENDER);

    container.innerHTML = shown.map(s => `
      <div class="session-card" data-id="${s.id}">
        <div class="session-card-top">
          <span class="session-subject">${this.escapeHTML(s.subject)}</span>
          <span class="session-date">${this.escapeHTML(s.date)}</span>
        </div>
        <div class="session-meta">${this.minutesToHM(s.minutes)} • Focus ${s.focus ?? "-"}/5 • Energy ${s.energy ?? "-"}/5</div>
        ${s.notes ? `<div class="session-notes">${this.escapeHTML(s.notes)}</div>` : ""}
        <div class="session-actions">
          <button class="edit-btn" data-id="${s.id}">Edit</button>
          <button class="delete-btn" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `).join("") + (sessions.length > MAX_RENDER ? `<div class="empty-state">Showing ${MAX_RENDER} of ${sessions.length} sessions. Refine your search to see more.</div>` : "");

    container.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", () => this.deleteSession(btn.dataset.id));
    });
    container.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", () => this.editSessionPrompt(btn.dataset.id));
    });
  },

  deleteSession(id) {
    const idx = this.db.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.db.sessions.splice(idx, 1);
    this.persist();
    this.renderHistoryList();
    this.toast("Session deleted");
  },

  editSessionPrompt(id) {
    const session = this.db.sessions.find(s => s.id === id);
    if (!session) return;
    const newMinutes = window.prompt("Edit duration (minutes):", session.minutes);
    if (newMinutes === null) return;
    const parsed = Number(newMinutes);
    if (!parsed || parsed <= 0) {
      this.toast("Invalid duration");
      return;
    }
    const newNotes = window.prompt("Edit notes:", session.notes || "");
    session.minutes = Math.round(parsed);
    if (newNotes !== null) session.notes = newNotes.trim();
    this.persist();
    this.renderHistoryList();
    this.toast("Session updated");
  },
    const idx = this.db.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.db.sessions.splice(idx, 1);
    this.persist();
    this.renderHistoryList();
    this.toast("Session deleted");
  },

  editSessionPrompt(id) {
    const session = this.db.sessions.find(s => s.id === id);
    if (!session) return;
    const newMinutes = window.prompt("Edit duration (minutes):", session.minutes);
    if (newMinutes === null) return;
    const parsed = Number(newMinutes);
    if (!parsed || parsed <= 0) {
      this.toast("Invalid duration");
      return;
    }
    const newNotes = window.prompt("Edit notes:", session.notes || "");
    session.minutes = Math.round(parsed);
    if (newNotes !== null) session.notes = newNotes.trim();
    this.persist();
    this.renderHistoryList();
    this.toast("Session updated");
  },

  /* ------------------------------------------------------------------
     11. CALENDAR
     ------------------------------------------------------------------ */
  renderCalendarPage() {
    const grid = this.$("calendar-grid");
    if (!grid) return;
    const view = this.calendarViewDate;
    const year = view.getFullYear(), month = view.getMonth();
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    this.setText("cal-month-label", `${monthNames[month]} ${year}`);

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const stats = this.getStats();
    const todayKey = this.formatDateKey(new Date());

    let html = "";
    ["M","T","W","T","F","S","S"].forEach(d => html += `<div class="cal-dow">${d}</div>`);
    for (let i = 0; i < startOffset; i++) html += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const key = this.formatDateKey(dateObj);
      const mins = stats.dayMinutes[key] || 0;
      const hasStudy = mins > 0;
      const isToday = key === todayKey;
      html += `<div class="cal-cell ${hasStudy ? "has-study" : ""} ${isToday ? "today" : ""}" data-date="${key}">
        <span class="cal-day-num">${day}</span>
        ${hasStudy ? `<span class="cal-day-hrs">${this.minutesToHours1(mins)}h</span>` : ""}
      </div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll(".cal-cell:not(.empty)").forEach(cell => {
      cell.addEventListener("click", () => this.showCalendarDayDetail(cell.dataset.date));
    });
  },

  showCalendarDayDetail(dateKey) {
    const detail = this.$("calendar-day-detail");
    const body = this.$("cal-detail-body");
    if (!detail || !body) return;
    const sessions = this.db.sessions.filter(s => s.date === dateKey);
    this.setText("cal-detail-date", dateKey);

    if (!sessions.length) {
      body.innerHTML = '<div class="empty-state">No sessions logged this day.</div>';
    } else {
      const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
      const bySubject = {};
      sessions.forEach(s => bySubject[s.subject] = (bySubject[s.subject] || 0) + s.minutes);
      let html = `<div class="mini-row"><span>Total hours</span><span>${this.minutesToHM(totalMin)}</span></div>`;
      html += `<div class="mini-row"><span>Sessions</span><span>${sessions.length}</span></div>`;
      html += Object.entries(bySubject).map(([subj, mins]) =>
        `<div class="mini-row"><span>${this.escapeHTML(subj)}</span><span>${this.minutesToHM(mins)}</span></div>`
      ).join("");
      body.innerHTML = html;
    }
    detail.style.display = "block";
  },

  /* ------------------------------------------------------------------
     12. ANALYTICS + CANVAS CHARTS
     ------------------------------------------------------------------ */
  renderAnalyticsPage() {
    const stats = this.getStats();
    const sessions = this.db.sessions;
    this.setText("an-total-sessions", stats.totalSessions);

    // Avg hours/day across all days with any session
    const uniqueDays = Object.keys(stats.dayMinutes).length || 1;
    this.setText("an-avg-hours", this.minutesToHours1(stats.lifetimeMin / uniqueDays) + "h");

    // Best / weakest subject by total minutes
    const subjEntries = Object.entries(stats.subjectMinutes);
    if (subjEntries.length) {
      subjEntries.sort((a, b) => b[1] - a[1]);
      this.setText("an-best-subject", subjEntries[0][0]);
      this.setText("an-weak-subject", subjEntries[subjEntries.length - 1][0]);
    } else {
      this.setText("an-best-subject", "--");
      this.setText("an-weak-subject", "--");
    }

    this.renderWeeklyHoursChart();
    this.renderMonthlyHoursChart();
    this.renderLifetimeTrendChart();
    this.renderSubjectDistChart("chart-subject-dist", stats.subjectMinutes);
    this.renderFocusEnergyTrend("chart-focus-trend", "focus");
    this.renderFocusEnergyTrend("chart-energy-trend", "energy");
    this.renderWeekdayChart();
    this.renderTimeOfDayChart();
  },

  getCanvasCtx(id) {
    const canvas = this.$(id);
    if (!canvas) return null;
    // Respect device pixel ratio for crisp lines, but keep logical coords simple.
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
    const cssHeight = canvas.height || 180;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w: cssWidth, h: cssHeight };
  },

  themeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  },

  drawBarChart(canvasId, labels, values, color) {
    const surface = this.getCanvasCtx(canvasId);
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.clearRect(0, 0, w, h);
    if (!values.length) { this.drawEmptyChart(ctx, w, h); return; }
    const max = Math.max(...values, 1);
    const padding = 24;
    const barGap = 6;
    const barWidth = (w - padding * 2) / values.length - barGap;
    const textColor = this.themeColor("--text-muted");

    values.forEach((v, i) => {
      const barHeight = ((h - padding - 16) * (v / max));
      const x = padding + i * ((w - padding * 2) / values.length);
      const y = h - padding - barHeight;
      const grad = ctx.createLinearGradient(0, y, 0, h - padding);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + "66");
      ctx.fillStyle = grad;
      this.roundRect(ctx, x, y, barWidth, barHeight, 4);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x + barWidth / 2, h - 8);
    });
  },

  drawLineChart(canvasId, labels, values, color) {
    const surface = this.getCanvasCtx(canvasId);
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.clearRect(0, 0, w, h);
    if (!values.length) { this.drawEmptyChart(ctx, w, h); return; }
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const padding = 24;
    const range = (max - min) || 1;
    const stepX = (w - padding * 2) / Math.max(1, values.length - 1);
    const textColor = this.themeColor("--text-muted");

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padding + i * stepX;
      const y = h - padding - ((v - min) / range) * (h - padding - 16);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // fill under line
    const last = padding + (values.length - 1) * stepX;
    ctx.lineTo(last, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = color + "22";
    ctx.fill();

    // points
    values.forEach((v, i) => {
      const x = padding + i * stepX;
      const y = h - padding - ((v - min) / range) * (h - padding - 16);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    ctx.fillStyle = textColor;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    labels.forEach((label, i) => {
      if (labels.length > 10 && i % Math.ceil(labels.length / 8) !== 0) return;
      const x = padding + i * stepX;
      ctx.fillText(label, x, h - 6);
    });
  },

  drawPieChart(canvasId, dataObj) {
    const surface = this.getCanvasCtx(canvasId);
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.clearRect(0, 0, w, h);
    const entries = Object.entries(dataObj).filter(([, v]) => v > 0);
    if (!entries.length) { this.drawEmptyChart(ctx, w, h); return; }
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const cx = w * 0.32, cy = h / 2, r = Math.min(cy, cx) - 10;
    let startAngle = -Math.PI / 2;

    entries.forEach(([subj, val]) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = this.SUBJECT_COLORS[subj] || "#7c5cff";
      ctx.fill();
      startAngle += slice;
    });

    // Legend
    const textColor = this.themeColor("--text-primary");
    ctx.font = "10.5px sans-serif";
    ctx.textAlign = "left";
    let legendY = 14;
    entries.slice(0, 8).forEach(([subj, val]) => {
      ctx.fillStyle = this.SUBJECT_COLORS[subj] || "#7c5cff";
      ctx.fillRect(w * 0.62, legendY - 8, 9, 9);
      ctx.fillStyle = textColor;
      const pct = Math.round((val / total) * 100);
      ctx.fillText(`${subj} ${pct}%`, w * 0.62 + 14, legendY);
      legendY += 16;
    });
  },

  drawEmptyChart(ctx, w, h) {
    ctx.fillStyle = this.themeColor("--text-muted");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data yet", w / 2, h / 2);
  },

  roundRect(ctx, x, y, w, h, r) {
    if (h < 0) { y += h; h = Math.abs(h); }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  renderSubjectDistChart(canvasId, dataObj) { this.drawPieChart(canvasId, dataObj); },

  renderWeeklyHoursChart() {
    const weeks = [];
    const values = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      const wk = this.getISOWeekKey(d);
      weeks.push(wk.slice(-3));
      const mins = this.db.sessions.filter(s => s.week === wk).reduce((a, s) => a + s.minutes, 0);
      values.push(this.minutesToHours1(mins));
    }
    this.drawBarChart("chart-weekly-hours", weeks, values, this.themeColor("--accent"));
  },

  renderMonthlyHoursChart() {
    const months = [];
    const values = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = this.getMonthKey(d);
      months.push(mk.slice(-2));
      const mins = this.db.sessions.filter(s => s.month === mk).reduce((a, s) => a + s.minutes, 0);
      values.push(this.minutesToHours1(mins));
    }
    this.drawBarChart("chart-monthly-hours", months, values, this.themeColor("--accent-strong"));
  },

  renderLifetimeTrendChart() {
    // Cumulative hours over the last 30 days with data
    const stats = this.getStats();
    const keys = Object.keys(stats.dayMinutes).sort();
    if (!keys.length) { this.drawLineChart("chart-lifetime-trend", [], [], this.themeColor("--accent")); return; }
    let cumulative = 0;
    const labels = [], values = [];
    const recentKeys = keys.slice(-30);
    let base = 0;
    for (const k of keys) { if (!recentKeys.includes(k)) base += stats.dayMinutes[k]; }
    cumulative = base;
    for (const k of recentKeys) {
      cumulative += stats.dayMinutes[k];
      labels.push(k.slice(5));
      values.push(this.minutesToHours1(cumulative));
    }
    this.drawLineChart("chart-lifetime-trend", labels, values, this.themeColor("--accent"));
  },

  renderFocusEnergyTrend(canvasId, field) {
    const sorted = [...this.db.sessions].sort((a, b) => a.timestamp - b.timestamp).slice(-20);
    const labels = sorted.map(s => s.date.slice(5));
    const values = sorted.map(s => s[field] || 0);
    this.drawLineChart(canvasId, labels, values, field === "focus" ? this.themeColor("--accent") : this.themeColor("--success"));
  },

  renderWeekdayChart() {
    const labels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const totals = [0,0,0,0,0,0,0];
    this.db.sessions.forEach(s => {
      const d = this.parseDateKey(s.date);
      const idx = (d.getDay() + 6) % 7;
      totals[idx] += s.minutes;
    });
    this.drawBarChart("chart-weekday", labels, totals.map(m => this.minutesToHours1(m)), this.themeColor("--accent"));
  },

  renderTimeOfDayChart() {
    const buckets = ["Night","Morning","Afternoon","Evening"];
    const totals = [0,0,0,0];
    this.db.sessions.forEach(s => {
      const hour = new Date(s.timestamp).getHours();
      let idx;
      if (hour < 6) idx = 0;
      else if (hour < 12) idx = 1;
      else if (hour < 18) idx = 2;
      else idx = 3;
      totals[idx] += s.minutes;
    });
    this.drawBarChart("chart-time-of-day", buckets, totals.map(m => this.minutesToHours1(m)), this.themeColor("--accent-strong"));
  },
  /* ------------------------------------------------------------------
     13. HABITS + SLEEP
     ------------------------------------------------------------------ */
  renderHabitsPage() {
    const todayKey = this.formatDateKey(new Date());
    const list = this.$("habit-checklist");
    if (list) {
      const todayLog = this.db.habits.logs[todayKey] || {};
      list.innerHTML = this.HABIT_DEFS.map(h => `
        <div class="habit-row" data-key="${h.key}">
          <div class="habit-checkbox ${todayLog[h.key] ? "checked" : ""}">
            <svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          </div>
          <span class="habit-name">${this.escapeHTML(h.label)}</span>
        </div>
      `).join("");
      list.querySelectorAll(".habit-row").forEach(row => {
        row.addEventListener("click", () => this.toggleHabit(row.dataset.key));
      });
    }

    const sleepInput = this.$("sleep-hours");
    if (sleepInput) sleepInput.value = this.db.sleep.logs[todayKey] || "";
    this.updateSleepWeekAvg();
  },

  toggleHabit(key) {
    const todayKey = this.formatDateKey(new Date());
    if (!this.db.habits.logs[todayKey]) this.db.habits.logs[todayKey] = {};
    this.db.habits.logs[todayKey][key] = !this.db.habits.logs[todayKey][key];
    this.persist();
    this.renderHabitsPage();
    this.renderDashboard();
  },

  saveSleep() {
    const input = this.$("sleep-hours");
    if (!input) return;
    const val = Number(input.value);
    if (!val || val < 0) { this.toast("Enter valid sleep hours"); return; }
    const todayKey = this.formatDateKey(new Date());
    this.db.sleep.logs[todayKey] = val;
    this.persist();
    this.updateSleepWeekAvg();
    this.toast("Sleep saved");
    this.renderDashboard();
  },

  updateSleepWeekAvg() {
    const weekStart = this.startOfWeek(new Date());
    let sum = 0, count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const key = this.formatDateKey(d);
      if (this.db.sleep.logs[key] != null) { sum += this.db.sleep.logs[key]; count++; }
    }
    this.setText("sleep-week-avg", count ? (sum / count).toFixed(1) + "h" : "0h");
  },

  /* ------------------------------------------------------------------
     14. JAPANESE
     ------------------------------------------------------------------ */
  renderJapanesePage() {
    const stats = this.getStats();
    this.setText("jp-week-hours", this.minutesToHM(stats.jpWeekMin + this.getImmersionMinutesThisWeek()));

    const settings = this.db.settings;
    const dateInput = this.$("jlpt-date");
    const levelInput = this.$("jlpt-level");
    if (dateInput) dateInput.value = settings.jlptDate || "";
    if (levelInput) levelInput.value = settings.jlptLevel || "N5";
    this.setText("jlpt-countdown-text", this.getJLPTCountdownText());

    this.setText("jp-weekly-summary", this.getJapaneseWeeklySummary());
  },

  getImmersionMinutesThisWeek() {
    const wk = this.getISOWeekKey(new Date());
    return this.db.immersion.logs
      .filter(i => this.getISOWeekKey(this.parseDateKey(i.date)) === wk)
      .reduce((a, i) => a + i.minutes, 0);
  },

  addImmersion() {
    const minInput = this.$("jp-immersion-min");
    const typeSelect = this.$("jp-immersion-type");
    const minutes = minInput ? Number(minInput.value) : 0;
    if (!minutes || minutes <= 0) { this.toast("Enter valid minutes"); return; }
    const now = new Date();
    this.db.immersion.logs.push({
      id: this.uid(),
      date: this.formatDateKey(now),
      minutes: Math.round(minutes),
      type: typeSelect ? typeSelect.value : "Other"
    });
    this.persist();
    if (minInput) minInput.value = "";
    this.toast("Immersion added");
    this.renderJapanesePage();
    this.renderDashboard();
  },

  saveJLPT() {
    const dateInput = this.$("jlpt-date");
    const levelInput = this.$("jlpt-level");
    this.db.settings.jlptDate = dateInput ? dateInput.value : "";
    this.db.settings.jlptLevel = levelInput ? levelInput.value : "N5";
    this.persist();
    this.toast("JLPT info saved");
    this.renderJapanesePage();
    this.renderDashboard();
  },

  getJLPTCountdownText() {
    const dateStr = this.db.settings.jlptDate;
    if (!dateStr) return "Not set";
    const examDate = new Date(dateStr + "T00:00:00");
    const days = this.daysBetween(new Date(), examDate);
    const level = this.db.settings.jlptLevel || "";
    if (days < 0) return `${level} exam date has passed`;
    if (days === 0) return `${level} exam is today!`;
    return `${days} days until ${level}`;
  },

  getJapaneseWeeklySummary() {
    const stats = this.getStats();
    const immersionMin = this.getImmersionMinutesThisWeek();
    const totalMin = stats.jpWeekMin + immersionMin;
    if (totalMin === 0) return "No Japanese activity logged this week yet.";
    return `This week: ${this.minutesToHM(stats.jpWeekMin)} of formal study plus ${this.minutesToHM(immersionMin)} of immersion, totalling ${this.minutesToHM(totalMin)}.`;
  },

  /* ------------------------------------------------------------------
     15. GOALS
     ------------------------------------------------------------------ */
  renderGoalsPage() {
    const g = this.db.goals;
    if (this.$("goal-daily")) this.$("goal-daily").value = g.daily || "";
    if (this.$("goal-weekly")) this.$("goal-weekly").value = g.weekly || "";
    if (this.$("goal-monthly")) this.$("goal-monthly").value = g.monthly || "";
    if (this.$("goal-yearly")) this.$("goal-yearly").value = g.yearly || "";

    const container = this.$("subject-goal-list");
    if (container) {
      container.innerHTML = this.SUBJECTS.map(subj => `
        <label class="field-label" for="subj-goal-${subj}">${subj} (hrs/week)</label>
        <input type="number" class="input-field" id="subj-goal-${subj}" min="0" step="0.5" value="${g.subjects[subj] || ""}" />
      `).join("");
    }
  },

  saveGoals() {
    const g = this.db.goals;
    g.daily = Number(this.$("goal-daily")?.value) || 0;
    g.weekly = Number(this.$("goal-weekly")?.value) || 0;
    g.monthly = Number(this.$("goal-monthly")?.value) || 0;
    g.yearly = Number(this.$("goal-yearly")?.value) || 0;
    this.persist();
    this.toast("Goals saved");
    this.renderDashboard();
  },

  saveSubjectGoals() {
    const g = this.db.goals;
    this.SUBJECTS.forEach(subj => {
      const el = this.$("subj-goal-" + subj);
      if (el) g.subjects[subj] = Number(el.value) || 0;
    });
    this.persist();
    this.toast("Subject goals saved");
  },

  /* ------------------------------------------------------------------
     16. WEEKLY PLANNER
     ------------------------------------------------------------------ */
  renderPlannerPage() {
    const stats = this.getStats();
    const g = this.db.goals;
    const list = this.$("planner-list");
    if (!list) return;

    const weekKey = stats.weekKey;
    const completedBySubject = {};
    this.db.sessions.filter(s => s.week === weekKey).forEach(s => {
      completedBySubject[s.subject] = (completedBySubject[s.subject] || 0) + s.minutes;
    });

    let totalGoal = 0, totalCompleted = 0;
    list.innerHTML = this.SUBJECTS.map(subj => {
      const goalHrs = g.subjects[subj] || 0;
      const completedMin = completedBySubject[subj] || 0;
      const completedHrs = this.minutesToHours1(completedMin);
      const pct = goalHrs ? Math.min(100, (completedMin / (goalHrs * 60)) * 100) : 0;
      totalGoal += goalHrs;
      totalCompleted += completedHrs;
      return `
        <div class="planner-row">
          <div class="planner-row-top"><span>${subj}</span><span>${completedHrs}h / ${goalHrs}h</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join("");

    const overallPct = totalGoal ? Math.round((totalCompleted / totalGoal) * 100) : 0;
    this.setText("planner-summary", totalGoal
      ? `You've completed ${totalCompleted.toFixed(1)}h of ${totalGoal}h planned this week (${overallPct}%).`
      : "Set subject goals on the Goals page to populate your planner.");
  },
    /* ------------------------------------------------------------------
     17. REVIEW
     ------------------------------------------------------------------ */
  renderReviewPage() {
    this.setText("weekly-review-summary", this.generateWeeklyReviewSummary());
    this.renderReviewHistory();
  },

  generateWeeklyReviewSummary() {
    const stats = this.getStats();
    const weekMin = stats.weekMin;
    const subjEntries = Object.entries(
      this.db.sessions.filter(s => s.week === stats.weekKey)
        .reduce((acc, s) => { acc[s.subject] = (acc[s.subject] || 0) + s.minutes; return acc; }, {})
    ).sort((a, b) => b[1] - a[1]);
    const top = subjEntries.length ? subjEntries[0][0] : "no subject yet";
    return `This week you studied ${this.minutesToHM(weekMin)}, with ${top} as your top subject.`;
  },

  saveDailyReview() {
    const now = new Date();
    const entry = {
      id: this.uid(),
      date: this.formatDateKey(now),
      mood: Number(this.$("review-mood")?.value) || 3,
      productivity: Number(this.$("review-productivity")?.value) || 3,
      success: this.$("review-success")?.value.trim() || "",
      distraction: this.$("review-distraction")?.value.trim() || "",
      plan: this.$("review-plan")?.value.trim() || ""
    };
    const existingIdx = this.db.reviews.daily.findIndex(r => r.date === entry.date);
    if (existingIdx >= 0) this.db.reviews.daily[existingIdx] = entry;
    else this.db.reviews.daily.push(entry);
    this.persist();
    this.toast("Daily review saved");
    this.renderReviewHistory();
  },

  saveWeeklyReview() {
    const stats = this.getStats();
    const entry = {
      id: this.uid(),
      week: stats.weekKey,
      achievement: this.$("review-week-achievement")?.value.trim() || "",
      weakness: this.$("review-week-weakness")?.value.trim() || "",
      plan: this.$("review-week-plan")?.value.trim() || ""
    };
    const existingIdx = this.db.reviews.weekly.findIndex(r => r.week === entry.week);
    if (existingIdx >= 0) this.db.reviews.weekly[existingIdx] = entry;
    else this.db.reviews.weekly.push(entry);
    this.persist();
    this.toast("Weekly review saved");
    this.renderReviewHistory();
  },

  renderReviewHistory() {
    const container = this.$("review-history-list");
    if (!container) return;
    const daily = [...this.db.reviews.daily].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    if (!daily.length) {
      container.innerHTML = '<div class="empty-state">No reviews yet.</div>';
      return;
    }
    container.innerHTML = daily.map(r => `
      <div class="session-card">
        <div class="session-card-top">
          <span class="session-subject">${this.escapeHTML(r.date)}</span>
          <span class="session-date">Mood ${r.mood}/5 • Productivity ${r.productivity}/5</span>
        </div>
        ${r.success ? `<div class="session-notes">Success: ${this.escapeHTML(r.success)}</div>` : ""}
        ${r.distraction ? `<div class="session-notes">Distraction: ${this.escapeHTML(r.distraction)}</div>` : ""}
        ${r.plan ? `<div class="session-notes">Plan: ${this.escapeHTML(r.plan)}</div>` : ""}
      </div>
    `).join("");
  },
  /* ------------------------------------------------------------------
     18. SETTINGS
     ------------------------------------------------------------------ */
  renderSettingsPage() {
    const s = this.db.settings;
    document.querySelectorAll("[data-theme]").forEach(btn => btn.classList.toggle("selected", btn.dataset.theme === s.theme));
    document.querySelectorAll("[data-accent]").forEach(btn => btn.classList.toggle("selected", btn.dataset.accent === s.accent));
    if (this.$("reminder-time")) this.$("reminder-time").value = s.reminderTime || "";
    this.setText("notif-permission-text", this.getNotificationPermissionText());
    this.updateInstallCard();
    this.renderGallerySettings();
  },

  applyTheme() {
    const s = this.db.settings;
    document.documentElement.setAttribute("data-theme", s.theme || "dark");
    document.documentElement.setAttribute("data-accent", s.accent || "purple");
  },

  setTheme(theme) {
    this.db.settings.theme = theme;
    this.persist();
    this.applyTheme();
    this.renderSettingsPage();
    this.renderPage(this.currentPage);
  },

  setAccent(accent) {
    this.db.settings.accent = accent;
    this.persist();
    this.applyTheme();
    this.renderSettingsPage();
    this.renderPage(this.currentPage);
  },

  getNotificationPermissionText() {
    if (!("Notification" in window)) return "Notifications aren't supported in this browser.";
    if (Notification.permission === "granted") return "Notifications enabled.";
    if (Notification.permission === "denied") return "Notifications blocked — enable them in your browser settings.";
    return "Tap Save Reminder to enable notifications.";
  },

  saveReminder() {
    const timeInput = this.$("reminder-time");
    this.db.settings.reminderTime = timeInput ? timeInput.value : "";
    this.persist();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(() => this.renderSettingsPage());
    } else {
      this.renderSettingsPage();
    }
    this.toast("Reminder saved");
  },

  exportBackup() {
    try {
      const data = JSON.stringify(this.db, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = this.formatDateKey(new Date());
      a.href = url;
      a.download = `kaizen-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.setText("backup-status-text", "Backup exported.");
    } catch (err) {
      console.error(err);
      this.toast("Export failed");
    }
  },

  importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sessions)) {
          throw new Error("Invalid backup structure");
        }
        const def = this.defaultDB();
        this.db = Object.assign({}, def, parsed);
        if (!this.db.goals) this.db.goals = def.goals;
        if (!this.db.goals.subjects) this.db.goals.subjects = {};
        if (!this.db.settings) this.db.settings = def.settings;
        if (!this.db.habits || !this.db.habits.logs) this.db.habits = { logs: {} };
        if (!this.db.reviews) this.db.reviews = { daily: [], weekly: [] };
        if (!this.db.sleep || !this.db.sleep.logs) this.db.sleep = { logs: {} };
        if (!this.db.immersion || !Array.isArray(this.db.immersion.logs)) this.db.immersion = { logs: [] };
        if (!this.db.gallery) this.db.gallery = { banner: "", avatar: "", thumbnails: [] };
        if (!Array.isArray(this.db.gallery.thumbnails)) this.db.gallery.thumbnails = [];
        this.persist();
        this.applyTheme();
        this.applyGalleryVisuals();
       
       this.setText("backup-status-text", "Backup imported successfully.");
        this.toast("Backup imported");
        this.renderPage(this.currentPage);
      } catch (err) {
        console.error(err);
        this.setText("backup-status-text", "Import failed — invalid file.");
        this.toast("Invalid backup file");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  },

  resetData() {
    const confirmed = window.confirm("This will permanently delete all Kaizen data on this device. Continue?");
    if (!confirmed) return;
    this.db = this.defaultDB();
    this.persist();
    this.applyTheme();
    this.applyGalleryVisuals();
    this.toast("All data reset");
    this.navigateTo("dashboard");
  },

  /* ------------------------------------------------------------------
     18b. INSTALL AS APP (PWA "Add to Home Screen")
     ------------------------------------------------------------------ */
  bindInstallPrompt() {
    // Chrome/Edge/Android fire this event when the app qualifies for install.
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.updateInstallCard();
    });

    window.addEventListener("appinstalled", () => {
      this.deferredInstallPrompt = null;
      this.toast("Kaizen installed");
      this.updateInstallCard();
    });

    const installBtn = this.$("install-app-btn");
    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        if (!this.deferredInstallPrompt) return;
        this.deferredInstallPrompt.prompt();
        await this.deferredInstallPrompt.userChoice;
        this.deferredInstallPrompt = null;
        this.updateInstallCard();
      });
    }

    this.updateInstallCard();
  },

  isRunningStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true; // iOS Safari flag
  },

  updateInstallCard() {
    const btn = this.$("install-app-btn");
    const text = this.$("install-instructions-text");
    const badge = this.$("install-status-badge");
    if (!btn || !text) return;

    if (this.isRunningStandalone()) {
      btn.style.display = "none";
      if (badge) badge.style.display = "inline-block";
      text.textContent = "Kaizen is already running as an installed app.";
      return;
    }
    if (badge) badge.style.display = "none";

    if (this.deferredInstallPrompt) {
      btn.style.display = "block";
      text.textContent = "Kaizen is ready to install for a full-screen, offline app experience.";
      return;
    }

    btn.style.display = "none";
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    if (isIOS) {
      text.textContent = "On iPhone/iPad: tap the Share icon in Safari, then \"Add to Home Screen\".";
    } else if (location.protocol !== "http:" && location.protocol !== "https:") {
      text.textContent = "Open this app over http(s):// (not as a local file) to enable installing it, e.g. by serving the folder or hosting it, then look for \"Install app\" in your browser's menu.";
    } else {
      text.textContent = "Look for \"Install app\" or \"Add to Home Screen\" in your browser's menu (⋮ on Android Chrome) to install Kaizen.";
    }
  },

  /* ------------------------------------------------------------------
     18c. GHIBLI GALLERY (user-supplied photos: banner, avatar, strip)
     ------------------------------------------------------------------
     Images are resized client-side via canvas before being stored as
     base64 data URLs inside kaizenDB, keeping everything in the single
     localStorage key while staying reasonably small.
     ------------------------------------------------------------------ */
  GALLERY_MAX_THUMBS: 12,

  resizeImageFile(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith("image/")) {
        reject(new Error("Not an image file"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode image"));
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  bindGalleryHandlers() {
    const bannerInput = this.$("upload-banner-input");
    if (bannerInput) bannerInput.addEventListener("change", (e) => this.handleBannerUpload(e));
    const removeBannerBtn = this.$("remove-banner-btn");
    if (removeBannerBtn) removeBannerBtn.addEventListener("click", () => this.removeBanner());

    const avatarInput = this.$("upload-avatar-input");
    if (avatarInput) avatarInput.addEventListener("change", (e) => this.handleAvatarUpload(e));
    const removeAvatarBtn = this.$("remove-avatar-btn");
    if (removeAvatarBtn) removeAvatarBtn.addEventListener("click", () => this.removeAvatar());

    const galleryInput = this.$("upload-gallery-input");
    if (galleryInput) galleryInput.addEventListener("change", (e) => this.handleGalleryUpload(e));
  },

  async handleBannerUpload(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await this.resizeImageFile(file, 1280, 0.75);
      const previous = this.db.gallery.banner;
      this.db.gallery.banner = dataUrl;
      if (!this.persist()) {
        this.db.gallery.banner = previous;
        this.toast("Image too large to store — try a smaller photo.");
        return;
      }
      this.applyGalleryVisuals();
      this.renderSettingsPage();
      this.toast("Banner updated");
    } catch (err) {
      console.error(err);
      this.toast("Couldn't load that image.");
    }
  },

  removeBanner() {
    this.db.gallery.banner = "";
    this.persist();
    this.applyGalleryVisuals();
    this.renderSettingsPage();
    this.toast("Banner removed");
  },

  async handleAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await this.resizeImageFile(file, 300, 0.8);
      const previous = this.db.gallery.avatar;
      this.db.gallery.avatar = dataUrl;
      if (!this.persist()) {
        this.db.gallery.avatar = previous;
        this.toast("Image too large to store — try a smaller photo.");
        return;
      }
      this.applyGalleryVisuals();
      this.renderSettingsPage();
      this.toast("Avatar updated");
    } catch (err) {
      console.error(err);
      this.toast("Couldn't load that image.");
    }
  },

  removeAvatar() {
    this.db.gallery.avatar = "";
    this.persist();
    this.applyGalleryVisuals();
    this.renderSettingsPage();
    this.toast("Avatar removed");
  },

  async handleGalleryUpload(event) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (!files.length) return;
    const remaining = this.GALLERY_MAX_THUMBS - this.db.gallery.thumbnails.length;
    if (remaining <= 0) {
      this.toast(`Gallery is full (max ${this.GALLERY_MAX_THUMBS}). Remove one first.`);
      return;
    }
    const toProcess = files.slice(0, remaining);
    let added = 0;
    for (const file of toProcess) {
      try {
        const dataUrl = await this.resizeImageFile(file, 480, 0.72);
        const entry = { id: this.uid(), src: dataUrl };
        this.db.gallery.thumbnails.push(entry);
        if (!this.persist()) {
          this.db.gallery.thumbnails.pop();
          this.toast("Storage full — couldn't add all photos.");
          break;
        }
        added++;
      } catch (err) {
        console.error(err);
      }
    }
    if (added) this.toast(`Added ${added} photo${added > 1 ? "s" : ""} to the gallery`);
    this.applyGalleryVisuals();
    this.renderSettingsPage();
  },

  removeGalleryThumb(id) {
    const idx = this.db.gallery.thumbnails.findIndex(t => t.id === id);
    if (idx === -1) return;
    this.db.gallery.thumbnails.splice(idx, 1);
    this.persist();
    this.applyGalleryVisuals();
    this.renderSettingsPage();
  },

  applyGalleryVisuals() {
    const gallery = this.db.gallery || { banner: "", avatar: "", thumbnails: [] };

    // Banner
    const banner = this.$("hero-banner");
    if (banner) {
      if (gallery.banner) {
        banner.style.backgroundImage = `url(${gallery.banner})`;
        banner.classList.add("has-photo");
      } else {
        banner.style.backgroundImage = "";
        banner.classList.remove("has-photo");
      }
    }

    // Avatar (top bar, left slot — stays empty, no placeholder, if unset)
    const topBarLeft = this.$("top-bar-left");
    if (topBarLeft) {
      topBarLeft.innerHTML = gallery.avatar
        ? `<img class="top-bar-avatar" src="${gallery.avatar}" alt="Avatar" />`
        : "";
    }

    // Gallery strip (hidden entirely when empty)
    const strip = this.$("gallery-strip");
    if (strip) {
      if (gallery.thumbnails && gallery.thumbnails.length) {
        strip.classList.remove("empty");
        strip.innerHTML = gallery.thumbnails.map(t => `<img src="${t.src}" alt="" />`).join("");
      } else {
        strip.classList.add("empty");
        strip.innerHTML = "";
      }
    }
  },

  renderGallerySettings() {
    const gallery = this.db.gallery || { banner: "", avatar: "", thumbnails: [] };

    const bannerWrap = this.$("banner-preview-wrap");
    const bannerImg = this.$("banner-preview-img");
    if (bannerWrap && bannerImg) {
      if (gallery.banner) {
        bannerImg.src = gallery.banner;
        bannerWrap.style.display = "flex";
      } else {
        bannerWrap.style.display = "none";
      }
    }

    const avatarWrap = this.$("avatar-preview-wrap");
    const avatarImg = this.$("avatar-preview-img");
    if (avatarWrap && avatarImg) {
      if (gallery.avatar) {
        avatarImg.src = gallery.avatar;
        avatarWrap.style.display = "flex";
      } else {
        avatarWrap.style.display = "none";
      }
    }

    const manageList = this.$("gallery-manage-list");
    if (manageList) {
      manageList.innerHTML = (gallery.thumbnails || []).map(t => `
        <div class="gallery-manage-item" data-id="${t.id}">
          <img src="${t.src}" alt="" />
          <button data-id="${t.id}" aria-label="Remove photo">×</button>
        </div>
      `).join("");
      manageList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => this.removeGalleryThumb(btn.dataset.id));
      });
    }
  },

  /* ------------------------------------------------------------------
     19. SERVICE WORKER
     --------------------------------*/
     registerServiceWorker() {
    if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
      navigator.serviceWorker.register("service-worker.js").catch(err => {
        console.warn("Kaizen: service worker registration failed.", err);
      });
    }
  }
};

/* Boot the app once the DOM is ready. */
document.addEventListener("DOMContentLoaded", () => App.init());
