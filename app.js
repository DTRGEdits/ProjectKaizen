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
    Maths:"#7c5cff", Physics:"#3b82f6", Chemistry:"#22c55e", Biology:"#f59e0b",
    History:"#ef4444", Geography:"#06b6d4", English:"#ec4899", Hindi:"#f97316",
    Japanese:"#a855f7", Computer:"#14b8a6", Essay:"#eab308", Projects:"#8b5cf6"
  },

  /* ------------------------------------------------------------------
     1. STATE
     ------------------------------------------------------------------ */
  db: null,           // in-memory copy of kaizenDB
  currentPage: "dashboard",
  calendarViewDate: new Date(), // month currently shown in Calendar page
  cache: {},           // memoized derived values, invalidated on save()

  /* ------------------------------------------------------------------
     2. INIT
     ------------------------------------------------------------------ */
  init() {
    this.loadDB();
    this.applyTheme();
    this.bindNavigation();
    this.bindGlobalHandlers();
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
        theme: "dark", accent: "purple",
        reminderTime: "", jlptDate: "", jlptLevel: "N5"
      },
      sleep: { logs: {} },
      immersion: { logs: [] }
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

  /* ------------------------------------------------------------------
     6. GLOBAL EVENT BINDINGS (buttons that exist once in the DOM)
     ------------------------------------------------------------------ */
  bindGlobalHandlers() {
    // Study logger
    document.querySelectorAll("#duration-grid .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#duration-grid .chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        const custom = this.$("study-custom");
        if (custom) custom.value = "";
        chip.dataset.active = "true";
        document.querySelectorAll("#duration-grid .chip").forEach(c => { if (c !== chip) c.dataset.active = ""; });
      });
    });
    const customInput = this.$("study-custom");
    if (customInput) customInput.addEventListener("input", () => {
      document.querySelectorAll("#duration-grid .chip").forEach(c => c.classList.remove("selected"));
    });

    const focusSlider = this.$("study-focus");
    if (focusSlider) focusSlider.addEventListener("input", () => this.setText("focus-value", focusSlider.value));
    const energySlider = this.$("study-energy");
    if (energySlider) energySlider.addEventListener("input", () => this.setText("energy-value", energySlider.value));

    const saveBtn = this.$("save-session-btn");
    if (saveBtn) saveBtn.addEventListener("click", () => this.saveSession());

    // History filters
    const searchInput = this.$("history-search");
    if (searchInput) searchInput.addEventListener("input", () => this.renderHistoryList());
    const filterSubject = this.$("history-filter-subject");
    if (filterSubject) filterSubject.addEventListener("change", () => this.renderHistoryList());
    const sortSelect = this.$("history-sort");
    if (sortSelect) sortSelect.addEventListener("change", () => this.renderHistoryList());

    // Calendar nav
    const calPrev = this.$("cal-prev");
    if (calPrev) calPrev.addEventListener("click", () => {
      this.calendarViewDate.setMonth(this.calendarViewDate.getMonth() - 1);
      this.renderCalendarPage();
    });
    const calNext = this.$("cal-next");
    if (calNext) calNext.addEventListener("click", () => {
      this.calendarViewDate.setMonth(this.calendarViewDate.getMonth() + 1);
      this.renderCalendarPage();
    });

    // Habits sleep
    const saveSleepBtn = this.$("save-sleep-btn");
    if (saveSleepBtn) saveSleepBtn.addEventListener("click", () => this.saveSleep());

    // Japanese
    const jpAddBtn = this.$("jp-add-immersion-btn");
    if (jpAddBtn) jpAddBtn.addEventListener("click", () => this.addImmersion());
    const jlptSaveBtn = this.$("jlpt-save-btn");
    if (jlptSaveBtn) jlptSaveBtn.addEventListener("click", () => this.saveJLPT());

    // Goals
    const saveGoalsBtn = this.$("save-goals-btn");
    if (saveGoalsBtn) saveGoalsBtn.addEventListener("click", () => this.saveGoals());
    const saveSubjectGoalsBtn = this.$("save-subject-goals-btn");
    if (saveSubjectGoalsBtn) saveSubjectGoalsBtn.addEventListener("click", () => this.saveSubjectGoals());

    // Review
    const moodSlider = this.$("review-mood");
    if (moodSlider) moodSlider.addEventListener("input", () => this.setText("mood-value", moodSlider.value));
    const prodSlider = this.$("review-productivity");
    if (prodSlider) prodSlider.addEventListener("input", () => this.setText("productivity-value", prodSlider.value));
    const saveDailyReviewBtn = this.$("save-daily-review-btn");
    if (saveDailyReviewBtn) saveDailyReviewBtn.addEventListener("click", () => this.saveDailyReview());
    const saveWeeklyReviewBtn = this.$("save-weekly-review-btn");
    if (saveWeeklyReviewBtn) saveWeeklyReviewBtn.addEventListener("click", () => this.saveWeeklyReview());

    // Settings
    document.querySelectorAll("[data-theme]").forEach(btn => {
      btn.addEventListener("click", () => this.setTheme(btn.dataset.theme));
    });
    document.querySelectorAll("[data-accent]").forEach(btn => {
      btn.addEventListener("click", () => this.setAccent(btn.dataset.accent));
    });
    const saveReminderBtn = this.$("save-reminder-btn");
    if (saveReminderBtn) saveReminderBtn.addEventListener("click", () => this.saveReminder());
    const exportBtn = this.$("export-backup-btn");
    if (exportBtn) exportBtn.addEventListener("click", () => this.exportBackup());
    const importInput = this.$("import-backup-input");
    if (importInput) importInput.addEventListener("change", (e) => this.importBackup(e));
    const resetBtn = this.$("reset-data-btn");
    if (resetBtn) resetBtn.addEventListener("click", () => this.resetData());
  },

  /* ------------------------------------------------------------------
     7. STATS ENGINE  (memoized per persist() call)
     ------------------------------------------------------------------ */
  getStats() {
    if (this.cache.stats) return this.cache.stats;

    const sessions = this.db.sessions;
    const now = new Date();
    const todayKey = this.formatDateKey(now);
    const weekKey = this.getISOWeekKey(now);
    const monthKey = this.getMonthKey(now);
    const yearKey = this.getYearKey(now);

    let todayMin = 0, weekMin = 0, monthMin = 0, yearMin = 0, lifetimeMin = 0;
    let focusSum = 0, focusCount = 0, energySum = 0, energyCount = 0;
    const subjectMinutes = {};
    const dayMinutes = {};       // dateKey -> minutes (for streaks + calendar)
    const dayFocus = {};         // dateKey -> {sum,count}
    let jpWeekMin = 0;

    for (const s of sessions) {
      const mins = s.minutes || 0;
      lifetimeMin += mins;
      if (s.date === todayKey) todayMin += mins;
      if (s.week === weekKey) weekMin += mins;
      if (s.month === monthKey) monthMin += mins;
      if (s.year === yearKey) yearMin += mins;
      if (s.week === weekKey && s.subject === "Japanese") jpWeekMin += mins;

      subjectMinutes[s.subject] = (subjectMinutes[s.subject] || 0) + mins;
      dayMinutes[s.date] = (dayMinutes[s.date] || 0) + mins;

      if (typeof s.focus === "number") { focusSum += s.focus; focusCount++; }
      if (typeof s.energy === "number") { energySum += s.energy; energyCount++; }
    }

    // Streak calculation: a day "counts" if total study >= 30 minutes.
    let currentStreak = 0;
    let cursor = this.stripTime(now);
    // If today has no qualifying study yet, streak counts back from yesterday
    if (!(dayMinutes[this.formatDateKey(cursor)] >= 30)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dayMinutes[this.formatDateKey(cursor)] >= 30) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Longest streak across all recorded days
    const allDayKeys = Object.keys(dayMinutes).sort();
    let longestStreak = 0, runStreak = 0, prevDate = null;
    for (const key of allDayKeys) {
      if (dayMinutes[key] < 30) { runStreak = 0; prevDate = null; continue; }
      const d = this.parseDateKey(key);
      if (prevDate && this.daysBetween(prevDate, d) === 1) {
        runStreak++;
      } else {
        runStreak = 1;
      }
      longestStreak = Math.max(longestStreak, runStreak);
      prevDate = d;
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    const stats = {
      todayMin, weekMin, monthMin, yearMin, lifetimeMin,
      currentStreak, longestStreak,
      avgFocus: focusCount ? (focusSum / focusCount) : null,
      avgEnergy: energyCount ? (energySum / energyCount) : null,
      subjectMinutes, dayMinutes,
      jpWeekMin,
      todayKey, weekKey, monthKey, yearKey,
      totalSessions: sessions.length
    };
    this.cache.stats = stats;
    return stats;
  },

  /* ------------------------------------------------------------------
     8. DASHBOARD
     ------------------------------------------------------------------ */
  renderDashboard() {
    const stats = this.getStats();
    this.setText("stat-today", this.minutesToHM(stats.todayMin));
    this.setText("stat-week", this.minutesToHM(stats.weekMin));
    this.setText("stat-month", this.minutesToHM(stats.monthMin));
    this.setText("stat-year", this.minutesToHM(stats.yearMin));
    this.setText("stat-lifetime", this.minutesToHM(stats.lifetimeMin));
    this.setText("stat-streak", stats.currentStreak + " days");
    this.setText("stat-longest-streak", stats.longestStreak + " days");
    this.setText("stat-avg-focus", stats.avgFocus != null ? stats.avgFocus.toFixed(1) : "--");
    this.setText("stat-avg-energy", stats.avgEnergy != null ? stats.avgEnergy.toFixed(1) : "--");

    // Quote of the day — deterministic by date so it doesn't change on every render.
    const dayIndex = Math.floor(Date.now() / 86400000) % this.QUOTES.length;
    this.setText("quote-of-day", this.QUOTES[dayIndex]);

    // Goal progress
    const goals = this.db.goals;
    const dailyGoalMin = (goals.daily || 0) * 60;
    const weeklyGoalMin = (goals.weekly || 0) * 60;
    this.setText("daily-goal-label", this.minutesToHours1(stats.todayMin) + " / " + (goals.daily || 0) + "h");
    this.setWidth("daily-goal-fill", dailyGoalMin ? (stats.todayMin / dailyGoalMin) * 100 : 0);
    this.setText("weekly-goal-label", this.minutesToHours1(stats.weekMin) + " / " + (goals.weekly || 0) + "h");
    this.setWidth("weekly-goal-fill", weeklyGoalMin ? (stats.weekMin / weeklyGoalMin) * 100 : 0);

    // Subject distribution (last 7 days) chart
    this.renderSubjectDistChart("chart-dash-subject", this.getSubjectMinutesInRange(7));

    // Kaizen score
    const score = this.computeKaizenScore();
    this.setText("kaizen-score-label", score + " / 100");
    this.setText("top-score-value", score);
    this.drawScoreRing(score);

    // Insights
    this.renderInsights();

    // Japanese quick stats
    this.setText("dash-jp-week", this.minutesToHM(stats.jpWeekMin));
    this.setText("dash-jlpt-countdown", this.getJLPTCountdownText());

    // Prediction
    this.setText("prediction-message", this.generatePrediction());
  },

  getSubjectMinutesInRange(days) {
    const cutoff = this.stripTime(new Date());
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const result = {};
    for (const s of this.db.sessions) {
      const d = this.parseDateKey(s.date);
      if (d >= cutoff) {
        result[s.subject] = (result[s.subject] || 0) + (s.minutes || 0);
      }
    }
    return result;
  },

  computeKaizenScore() {
    // Documented formula — see README.md "Kaizen Score Formula".
    // Consistency 25 | Study hours 20 | Habits 15 | Sleep 10 | Focus 10 | Energy 10 | Goals 10
    const stats = this.getStats();
    const goals = this.db.goals;

    // Consistency: current streak capped at 14 days => 25 pts
    const consistency = Math.min(25, (stats.currentStreak / 14) * 25);

    // Study hours: today's minutes vs daily goal => 20 pts
    const dailyGoalMin = (goals.daily || 2) * 60;
    const studyHours = dailyGoalMin ? Math.min(20, (stats.todayMin / dailyGoalMin) * 20) : 0;

    // Habits: today's completed habits ratio => 15 pts
    const todayKey = this.formatDateKey(new Date());
    const todayHabits = (this.db.habits.logs[todayKey]) || {};
    const habitCount = this.HABIT_DEFS.length;
    const habitsDone = this.HABIT_DEFS.filter(h => todayHabits[h.key]).length;
    const habitsScore = habitCount ? (habitsDone / habitCount) * 15 : 0;

    // Sleep: last logged hours vs 7h target => 10 pts
    const sleepKeys = Object.keys(this.db.sleep.logs).sort();
    const lastSleep = sleepKeys.length ? this.db.sleep.logs[sleepKeys[sleepKeys.length - 1]] : null;
    const sleepScore = lastSleep != null ? Math.min(10, (lastSleep / 7) * 10) : 5;

    // Focus: today's average focus vs 5 => 10 pts
    const todaySessions = this.db.sessions.filter(s => s.date === todayKey);
    const focusAvgToday = todaySessions.length
      ? todaySessions.reduce((a, s) => a + (s.focus || 0), 0) / todaySessions.length
      : (stats.avgFocus || 0);
    const focusScore = focusAvgToday ? (focusAvgToday / 5) * 10 : 0;

    // Energy: today's average energy vs 5 => 10 pts
    const energyAvgToday = todaySessions.length
      ? todaySessions.reduce((a, s) => a + (s.energy || 0), 0) / todaySessions.length
      : (stats.avgEnergy || 0);
    const energyScore = energyAvgToday ? (energyAvgToday / 5) * 10 : 0;

    // Goal completion: weekly progress => 10 pts
    const weeklyGoalMin = (goals.weekly || 14) * 60;
    const goalScore = weeklyGoalMin ? Math.min(10, (stats.weekMin / weeklyGoalMin) * 10) : 0;

    const total = consistency + studyHours + habitsScore + sleepScore + focusScore + energyScore + goalScore;
    return Math.round(Math.max(0, Math.min(100, total)));
  },

  drawScoreRing(score) {
    const canvas = this.$("kaizen-score-ring");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7c5cff";
    const track = getComputedStyle(document.documentElement).getPropertyValue("--bg-elev-3").trim() || "#262032";

    ctx.lineWidth = 12;
    ctx.strokeStyle = track;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    ctx.beginPath();
    const endAngle = -Math.PI / 2 + (Math.PI * 2) * (score / 100);
    ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
    ctx.stroke();

    this.setText("kaizen-score-ring-value", score);
  },

  renderInsights() {
    const list = this.$("insight-list");
    if (!list) return;
    const insights = this.generateInsights();
    if (!insights.length) {
      list.innerHTML = '<li>Log a few sessions to unlock insights.</li>';
      return;
    }
    list.innerHTML = insights.map(i => `<li>${this.escapeHTML(i)}</li>`).join("");
  },

  generateInsights() {
    const insights = [];
    const stats = this.getStats();
    const sessions = this.db.sessions;
    if (!sessions.length) return insights;

    // Consistency check for a subject: studied on 4+ of last 7 days
    const last7 = this.stripTime(new Date());
    last7.setDate(last7.getDate() - 6);
    const bySubjectDays = {};
    const last7Sessions = sessions.filter(s => this.parseDateKey(s.date) >= last7);
    last7Sessions.forEach(s => {
      bySubjectDays[s.subject] = bySubjectDays[s.subject] || new Set();
      bySubjectDays[s.subject].add(s.date);
    });
    for (const subj in bySubjectDays) {
      if (bySubjectDays[subj].size >= 4) {
        insights.push(`You study ${subj} consistently (${bySubjectDays[subj].size} of the last 7 days).`);
      }
    }

    // Focus trend: compare avg focus of last 5 sessions vs previous 5
    const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length >= 6) {
      const recent = sorted.slice(-5);
      const prior = sorted.slice(-10, -5);
      const avg = arr => arr.reduce((a, s) => a + (s.focus || 0), 0) / arr.length;
      if (prior.length) {
        const diff = avg(recent) - avg(prior);
        if (diff <= -0.6) insights.push("Your focus is dropping compared to recent sessions.");
        else if (diff >= 0.6) insights.push("Your focus is improving — keep it up.");
      }
    }

    // Japanese immersion trend: this week vs last week
    const now = new Date();
    const thisWeekKey = this.getISOWeekKey(now);
    const lastWeekDate = new Date(now); lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekKey = this.getISOWeekKey(lastWeekDate);
    const immersion = this.db.immersion.logs;
    const sumImmersion = (wk) => immersion.filter(i => this.getISOWeekKey(this.parseDateKey(i.date)) === wk)
      .reduce((a, i) => a + i.minutes, 0);
    const thisWeekImm = sumImmersion(thisWeekKey) + (stats.jpWeekMin || 0);
    const lastWeekImm = sumImmersion(lastWeekKey);
    if (lastWeekImm > 0 && thisWeekImm > lastWeekImm * 1.15) {
      insights.push("Japanese immersion increased compared to last week.");
    } else if (lastWeekImm > 0 && thisWeekImm < lastWeekImm * 0.7) {
      insights.push("Japanese immersion dropped compared to last week.");
    }

    // Weekly goal check
    const weeklyGoalMin = (this.db.goals.weekly || 0) * 60;
    if (weeklyGoalMin > 0) {
      const now2 = new Date();
      const dow = (now2.getDay() + 6) % 7; // days elapsed this week (Mon=0)
      const expectedByNow = weeklyGoalMin * ((dow + 1) / 7);
      if (stats.weekMin < expectedByNow * 0.7) {
        insights.push("You're behind your weekly goal — consider an extra session today.");
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
    // Replace existing entry for today if present
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
        this.persist();
        this.applyTheme();
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
    this.toast("All data reset");
    this.navigateTo("dashboard");
  },

  /* ------------------------------------------------------------------
     19. SERVICE WORKER
     ------------------------------------------------------------------ */
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
