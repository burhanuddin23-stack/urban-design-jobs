const DATA_URL = "./data/marketing-companies.json";
const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = "maria-marketing-compass";

const cityFilter = document.getElementById("cityFilter");
const specialtyFilter = document.getElementById("specialtyFilter");
const hiringGrid = document.getElementById("hiringGrid");
const directoryGrid = document.getElementById("directoryGrid");
const alertFeed = document.getElementById("alertFeed");
const alertStatusText = document.getElementById("alertStatusText");
const unreadAlertCount = document.getElementById("unreadAlertCount");
const notificationsToggle = document.getElementById("notificationsToggle");
const watchParisToggle = document.getElementById("watchParisToggle");
const watchLuxembourgToggle = document.getElementById("watchLuxembourgToggle");
const watchHiringToggle = document.getElementById("watchHiringToggle");
const watchDirectoryToggle = document.getElementById("watchDirectoryToggle");
const markAlertsReadButton = document.getElementById("markAlertsReadButton");
const refreshFeedButton = document.getElementById("refreshFeedButton");
const openRouteCount = document.getElementById("openRouteCount");
const directoryCount = document.getElementById("directoryCount");
const featuredQuote = document.getElementById("featuredQuote");
const quoteRail = document.getElementById("quoteRail");
const syncState = document.getElementById("syncState");
const feedTimestamp = document.getElementById("feedTimestamp");

const defaultPreferences = {
  notifications: false,
  watchParis: true,
  watchLuxembourg: true,
  watchHiring: true,
  watchDirectory: true,
  seenHiringDate: "2026-03-10",
  seenDirectoryDate: "2026-03-10",
  notifiedAlertIds: [],
};

const state = {
  hiringOpportunities: [],
  agencyDirectory: [],
  motivationalQuotes: [],
  updatedAt: null,
  pollingHandle: null,
  isRefreshing: false,
};

let preferences = loadPreferences();

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...defaultPreferences, ...saved };
  } catch {
    return { ...defaultPreferences };
  }
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function getWatchedCities() {
  return [
    preferences.watchParis ? "Paris" : null,
    preferences.watchLuxembourg ? "Luxembourg" : null,
  ].filter(Boolean);
}

function matchesFilter(entry) {
  const cityMatches = cityFilter.value === "all" || entry.city === cityFilter.value;
  const specialtyMatches =
    specialtyFilter.value === "all" || entry.focus.includes(specialtyFilter.value);
  return cityMatches && specialtyMatches;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLatestAddedOn(entries) {
  return entries.reduce((latest, entry) => (entry.addedOn > latest ? entry.addedOn : latest), "1970-01-01");
}

function createBadge(label, className = "badge-note") {
  return `<span class="badge ${className}">${label}</span>`;
}

function createCompanyCard(entry, mode) {
  const badges = [
    createBadge(entry.city, "badge-note"),
    ...entry.focus.map((item) => createBadge(item, "badge-note")),
  ];

  if (mode === "hiring") {
    badges.unshift(createBadge(entry.status, "badge-open"));
  } else {
    badges.unshift(createBadge(entry.hiringState, "badge-note"));
  }

  return `
    <article class="company-card fade-up">
      <div class="company-head">
        <div>
          <h3>${entry.name}</h3>
          <div class="company-location">${entry.city}</div>
        </div>
      </div>
      <div class="badge-stack">${badges.join("")}</div>
      <p class="card-copy">${entry.summary}</p>
      <div class="card-meta">
        ${
          mode === "hiring"
            ? `<span>${entry.internshipFit}</span>`
            : `<span>${entry.hiringState}</span>`
        }
        <span>Added to this shortlist on ${formatDate(entry.addedOn)}</span>
      </div>
      <div class="card-actions">
        <a class="button link-button" href="${mode === "hiring" ? entry.hiringUrl : entry.siteUrl}" target="_blank" rel="noreferrer">
          ${mode === "hiring" ? "Open hiring page" : "Visit website"}
        </a>
        <a class="button ghost-button source-link" href="${entry.sourceUrl}" target="_blank" rel="noreferrer">Source</a>
      </div>
    </article>
  `;
}

function createQuoteInsert(quote) {
  return `
    <article class="quote-card quote-insert fade-up">
      <blockquote>“${quote.quote}”</blockquote>
      <footer>${quote.author}</footer>
    </article>
  `;
}

function renderHiring() {
  const filtered = state.hiringOpportunities.filter(matchesFilter);

  if (filtered.length === 0) {
    hiringGrid.innerHTML = `
      <div class="empty-state">
        <p>No results match this filter yet. Try another city or discipline.</p>
      </div>
    `;
    return;
  }

  const quotes = state.motivationalQuotes;
  const fragments = [];

  filtered.forEach((entry, index) => {
    fragments.push(createCompanyCard(entry, "hiring"));
    if (quotes.length > 0 && (index + 1) % 3 === 0) {
      fragments.push(createQuoteInsert(quotes[index % quotes.length]));
    }
  });

  hiringGrid.innerHTML = fragments.join("");
}

function renderDirectory() {
  const filtered = state.agencyDirectory.filter(matchesFilter);

  if (filtered.length === 0) {
    directoryGrid.innerHTML = `
      <div class="empty-state">
        <p>No agencies match this filter yet. Try another city or discipline.</p>
      </div>
    `;
    return;
  }

  const quotes = state.motivationalQuotes;
  directoryGrid.innerHTML = filtered
    .map((entry, index) => {
      const card = createCompanyCard(entry, "directory");
      const quote =
        quotes.length > 0 && (index + 1) % 4 === 0
          ? createQuoteInsert(quotes[(index + 1) % quotes.length])
          : "";
      return `${card}${quote}`;
    })
    .join("");
}

function collectAlerts() {
  const watchedCities = getWatchedCities();
  const alerts = [];

  if (preferences.watchHiring) {
    state.hiringOpportunities
      .filter((entry) => entry.addedOn > preferences.seenHiringDate)
      .filter((entry) => watchedCities.includes(entry.city))
      .forEach((entry) => {
        alerts.push({
          id: `hiring-${entry.id}`,
          kind: "New opportunity",
          title: `${entry.name} has an active route to apply`,
          meta: `${entry.city} • ${entry.status}`,
          url: entry.hiringUrl,
        });
      });
  }

  if (preferences.watchDirectory) {
    state.agencyDirectory
      .filter((entry) => entry.addedOn > preferences.seenDirectoryDate)
      .filter((entry) => watchedCities.includes(entry.city))
      .forEach((entry) => {
        alerts.push({
          id: `directory-${entry.id}`,
          kind: "New agency added",
          title: `${entry.name} was added to the directory`,
          meta: `${entry.city} • ${entry.hiringState}`,
          url: entry.siteUrl,
        });
      });
  }

  return alerts;
}

function maybeSendNotification(alerts) {
  if (!preferences.notifications || !("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const freshAlerts = alerts.filter((alert) => !preferences.notifiedAlertIds.includes(alert.id));
  if (freshAlerts.length === 0) {
    return;
  }

  const notification = new Notification("Maria's Marketing Compass", {
    body: `${freshAlerts.length} new alert${freshAlerts.length > 1 ? "s" : ""} in Paris / Luxembourg.`,
  });

  notification.onclick = () => window.focus();
  preferences.notifiedAlertIds = [...preferences.notifiedAlertIds, ...freshAlerts.map((item) => item.id)];
  savePreferences();
}

function renderAlerts() {
  const alerts = collectAlerts();
  unreadAlertCount.textContent = String(alerts.length);

  if (alerts.length === 0) {
    alertStatusText.textContent =
      "Everything is reviewed. Check back after the live feed gets another update.";
    alertStatusText.classList.add("alert-status-good");
    alertFeed.className = "alert-feed empty-state";
    alertFeed.innerHTML = "<p>No unread alerts right now.</p>";
    return;
  }

  alertStatusText.textContent =
    "Fresh items are waiting. Review them and then mark the alert center as checked.";
  alertStatusText.classList.remove("alert-status-good");
  alertFeed.className = "alert-feed";
  alertFeed.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-card fade-up">
          <span>${alert.kind}</span>
          <strong>${alert.title}</strong>
          <p class="card-note">${alert.meta}</p>
          <a class="button ghost-button" href="${alert.url}" target="_blank" rel="noreferrer">Open link</a>
        </article>
      `,
    )
    .join("");

  maybeSendNotification(alerts);
}

function renderQuotes() {
  const quotes = state.motivationalQuotes;

  if (quotes.length === 0) {
    featuredQuote.innerHTML = `
      <p class="section-kicker">Today's reminder</p>
      <blockquote>“Keep moving. The right door often opens after the next application.”</blockquote>
      <footer>Unknown</footer>
    `;
    quoteRail.innerHTML = "";
    return;
  }

  featuredQuote.innerHTML = `
    <p class="section-kicker">Today's reminder</p>
    <blockquote>“${quotes[0].quote}”</blockquote>
    <footer>${quotes[0].author}</footer>
  `;

  quoteRail.innerHTML = quotes
    .slice(1)
    .map(
      (entry) => `
        <article class="quote-card fade-up">
          <blockquote>“${entry.quote}”</blockquote>
          <footer>${entry.author}</footer>
        </article>
      `,
    )
    .join("");
}

function renderStats() {
  openRouteCount.textContent = String(state.hiringOpportunities.length);
  directoryCount.textContent = String(state.agencyDirectory.length);
}

function renderAll() {
  renderStats();
  renderHiring();
  renderDirectory();
  renderAlerts();
  renderQuotes();
}

function syncControls() {
  notificationsToggle.checked = preferences.notifications;
  watchParisToggle.checked = preferences.watchParis;
  watchLuxembourgToggle.checked = preferences.watchLuxembourg;
  watchHiringToggle.checked = preferences.watchHiring;
  watchDirectoryToggle.checked = preferences.watchDirectory;
}

function setSyncStatus(message, stateClass = "") {
  syncState.textContent = message;
  syncState.className = stateClass;
}

function updateFeedTimestamp() {
  feedTimestamp.textContent = state.updatedAt
    ? `Feed updated ${formatDateTime(state.updatedAt)}`
    : "Feed timestamp unavailable";
}

function applyData(payload) {
  state.hiringOpportunities = Array.isArray(payload.hiringOpportunities) ? payload.hiringOpportunities : [];
  state.agencyDirectory = Array.isArray(payload.agencyDirectory) ? payload.agencyDirectory : [];
  state.motivationalQuotes = Array.isArray(payload.motivationalQuotes) ? payload.motivationalQuotes : [];
  state.updatedAt = payload.updatedAt || new Date().toISOString();
  updateFeedTimestamp();
  renderAll();
}

async function fetchLiveData(reason = "sync") {
  if (state.isRefreshing) {
    return;
  }

  state.isRefreshing = true;
  refreshFeedButton.disabled = true;
  setSyncStatus(reason === "manual" ? "Refreshing live feed..." : "Checking for updates...");

  try {
    const response = await fetch(`${DATA_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    const payload = await response.json();
    applyData(payload);
    setSyncStatus("Live feed connected", "sync-live");
  } catch (error) {
    setSyncStatus("Live feed unavailable", "sync-error");
    if (state.hiringOpportunities.length === 0) {
      hiringGrid.innerHTML = `
        <div class="empty-state">
          <p>The live data feed could not be loaded. Serve this site from a local or hosted web server so the JSON feed can be fetched.</p>
        </div>
      `;
      directoryGrid.innerHTML = "";
      alertFeed.className = "alert-feed empty-state";
      alertFeed.innerHTML = "<p>Alerts will appear once the live feed is reachable.</p>";
    }
    console.error(error);
  } finally {
    state.isRefreshing = false;
    refreshFeedButton.disabled = false;
  }
}

function markAlertsRead() {
  preferences.seenHiringDate = getLatestAddedOn(state.hiringOpportunities);
  preferences.seenDirectoryDate = getLatestAddedOn(state.agencyDirectory);
  savePreferences();
  renderAlerts();
}

function startPolling() {
  if (state.pollingHandle) {
    clearInterval(state.pollingHandle);
  }

  state.pollingHandle = window.setInterval(() => {
    fetchLiveData("poll");
  }, POLL_INTERVAL_MS);
}

function attachEvents() {
  cityFilter.addEventListener("change", () => {
    renderHiring();
    renderDirectory();
  });

  specialtyFilter.addEventListener("change", () => {
    renderHiring();
    renderDirectory();
  });

  notificationsToggle.addEventListener("change", async (event) => {
    const wantsNotifications = event.target.checked;

    if (wantsNotifications && "Notification" in window) {
      const result = await Notification.requestPermission();
      preferences.notifications = result === "granted";
    } else {
      preferences.notifications = false;
    }

    syncControls();
    savePreferences();
    renderAlerts();
  });

  [
    [watchParisToggle, "watchParis"],
    [watchLuxembourgToggle, "watchLuxembourg"],
    [watchHiringToggle, "watchHiring"],
    [watchDirectoryToggle, "watchDirectory"],
  ].forEach(([element, key]) => {
    element.addEventListener("change", (event) => {
      preferences[key] = event.target.checked;
      savePreferences();
      renderAlerts();
    });
  });

  markAlertsReadButton.addEventListener("click", markAlertsRead);
  refreshFeedButton.addEventListener("click", () => fetchLiveData("manual"));
}

function init() {
  syncControls();
  attachEvents();
  fetchLiveData("initial");
  startPolling();
}

init();
