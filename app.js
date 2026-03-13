const DATA_URL = "./data/marketing-companies.json";
const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = "maria-marketing-compass";

const cityFilter = document.getElementById("cityFilter");
const specialtyFilter = document.getElementById("specialtyFilter");
const hiringTableBody = document.getElementById("hiringTableBody");
const directoryTableBody = document.getElementById("directoryTableBody");
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
    // Ignore storage failures and keep the page usable.
  }
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

function renderPills(items) {
  return `<div class="pill-list">${items.map((item) => `<span class="pill">${item}</span>`).join("")}</div>`;
}

function buildLinkChips(entry, mode) {
  const chips = [
    `<a class="link-chip secondary" href="${entry.siteUrl}" target="_blank" rel="noreferrer">Website</a>`,
    `<a class="link-chip secondary" href="${entry.sourceUrl}" target="_blank" rel="noreferrer">Source</a>`,
  ];

  if (mode === "hiring" && entry.hiringUrl) {
    chips.unshift(
      `<a class="link-chip" href="${entry.hiringUrl}" target="_blank" rel="noreferrer">Hiring</a>`,
    );
  }

  return `<div class="table-links">${chips.join("")}</div>`;
}

function createHiringRow(entry) {
  return `
    <tr>
      <td data-label="Company">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.internshipFit}</div>
      </td>
      <td data-label="City">${entry.city}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Status">
        <div class="company-name">${entry.status}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="Links">${buildLinkChips(entry, "hiring")}</td>
    </tr>
  `;
}

function createDirectoryRow(entry) {
  return `
    <tr>
      <td data-label="Company">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="City">${entry.city}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Hiring note">${entry.hiringState}</td>
      <td data-label="Links">${buildLinkChips(entry, "directory")}</td>
    </tr>
  `;
}

function renderHiring() {
  const filtered = state.hiringOpportunities.filter(matchesFilter);

  if (filtered.length === 0) {
    hiringTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">No results match this filter yet. Try another city or discipline.</div>
        </td>
      </tr>
    `;
    return;
  }

  hiringTableBody.innerHTML = filtered.map(createHiringRow).join("");
}

function renderDirectory() {
  const filtered = state.agencyDirectory.filter(matchesFilter);

  if (filtered.length === 0) {
    directoryTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">No agencies match this filter yet. Try another city or discipline.</div>
        </td>
      </tr>
    `;
    return;
  }

  directoryTableBody.innerHTML = filtered.map(createDirectoryRow).join("");
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
          url: entry.hiringUrl || entry.sourceUrl,
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

  const notification = new Notification("Marketing internship updates", {
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
    alertStatusText.textContent = "Everything is reviewed.";
    alertFeed.className = "alert-feed empty-state";
    alertFeed.innerHTML = "<p>No unread alerts right now.</p>";
    return;
  }

  alertStatusText.textContent = "Fresh items are waiting.";
  alertFeed.className = "alert-feed";
  alertFeed.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-card">
          <span>${alert.kind}</span>
          <strong>${alert.title}</strong>
          <p class="table-note">${alert.meta}</p>
          <a class="link-chip secondary" href="${alert.url}" target="_blank" rel="noreferrer">Open</a>
        </article>
      `,
    )
    .join("");

  maybeSendNotification(alerts);
}

function renderQuote() {
  const quote =
    state.motivationalQuotes[0] || {
      quote: "Keep moving. The right door often opens after the next application.",
      author: "Unknown",
    };

  featuredQuote.innerHTML = `
    <p class="section-kicker">One reminder</p>
    <blockquote>“${quote.quote}”</blockquote>
    <footer>${quote.author}</footer>
  `;
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
  renderQuote();
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
  setSyncStatus(reason === "manual" ? "Refreshing..." : "Checking...");

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
      hiringTableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">The live data feed could not be loaded.</div>
          </td>
        </tr>
      `;
      directoryTableBody.innerHTML = "";
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
