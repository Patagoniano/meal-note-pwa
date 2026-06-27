const DB_NAME = "meal-note-db";
const STORE_NAME = "meals";
const ACTIVE_KEY = "meal-note-active";
const SYNC_CONFIG_KEY = "meal-note-sync-config";
const SYNC_DELETES_KEY = "meal-note-sync-deletes";

const mealNames = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食" };
const mealSymbols = { breakfast: "☀", lunch: "◐", dinner: "☾", snack: "◇" };

let records = [];
let selectedMeal = "breakfast";
let currentFilter = "all";
let timerHandle;
let deferredInstallPrompt;
let dialogPhoto = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function removeRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getActiveMeal() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch { return null; }
}

function setActiveMeal(meal) {
  if (meal) localStorage.setItem(ACTIVE_KEY, JSON.stringify(meal));
  else localStorage.removeItem(ACTIVE_KEY);
}

function getSyncConfig() {
  try { return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)) || {}; } catch { return {}; }
}

function setSyncConfig(config) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

function getDeletedSyncIds() {
  try { return JSON.parse(localStorage.getItem(SYNC_DELETES_KEY)) || []; } catch { return []; }
}

function setDeletedSyncIds(ids) {
  localStorage.setItem(SYNC_DELETES_KEY, JSON.stringify([...new Set(ids)]));
}

function queueDeletedSyncId(id) {
  setDeletedSyncIds([...getDeletedSyncIds(), id]);
}

function isSameDay(value, comparison = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === comparison.getFullYear()
    && date.getMonth() === comparison.getMonth()
    && date.getDate() === comparison.getDate();
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value) {
  const date = new Date(value);
  if (isSameDay(date)) return "今日";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "昨日";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
}

function toLocalInput(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.handle);
  showToast.handle = setTimeout(() => toast.classList.remove("show"), 2200);
}

async function resizePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", .78);
}

function syncComparableRecord(record) {
  return {
    id: record.id,
    type: record.type,
    start: record.start,
    end: record.end,
    alcohol: Boolean(record.alcohol),
    note: record.note || "",
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
    hasPhoto: Boolean(record.photo)
  };
}

function recordSyncHash(record) {
  return JSON.stringify(syncComparableRecord(record));
}

function toSheetRecord(record) {
  return {
    ...syncComparableRecord(record),
    mealName: mealNames[record.type] || record.type,
    durationMinutes: minutesBetween(record.start, record.end),
    syncedFrom: "Meal Note PWA"
  };
}

function render() {
  renderActiveMeal();
  renderSummary();
  renderSyncPanel();
  renderRecords();
}

function renderActiveMeal() {
  const active = getActiveMeal();
  $("#idleState").hidden = Boolean(active);
  $("#activeState").hidden = !active;
  clearInterval(timerHandle);
  if (!active) return;

  $("#activeMealName").textContent = mealNames[active.type];
  $("#activeStartedAt").textContent = `${formatTime(active.start)} に開始${active.alcohol ? "・アルコールあり" : ""}`;
  $("#activePhotoReady").hidden = !active.photo;

  const updateTimer = () => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(active.start).getTime()) / 1000));
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    $("#timerDisplay").textContent = `${h}:${m}:${s}`;
  };
  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
}

function renderSummary() {
  const today = records.filter((record) => isSameDay(record.start));
  $("#todayCount").textContent = today.length;
  $("#todayMinutes").innerHTML = `${today.reduce((sum, record) => sum + minutesBetween(record.start, record.end), 0)}<em>分</em>`;
  $("#alcoholCount").textContent = today.filter((record) => record.alcohol).length;
}

function renderSyncPanel() {
  const panel = $("#syncPanel");
  if (!panel) return;
  const config = getSyncConfig();
  const pendingCount = records.filter((record) => record.syncHash !== recordSyncHash(record)).length + getDeletedSyncIds().length;
  $("#sheetEndpoint").value = config.endpoint || "";
  $("#autoSync").checked = config.autoSync !== false;
  $("#syncState").textContent = config.endpoint
    ? `未同期 ${pendingCount} 件${config.lastSyncedAt ? ` / 最終同期 ${new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(config.lastSyncedAt))}` : ""}`
    : "Google Apps ScriptのWebアプリURLを入れると同期できます";
}

function filteredRecords() {
  const sorted = [...records].sort((a, b) => new Date(b.start) - new Date(a.start));
  if (currentFilter === "today") return sorted.filter((record) => isSameDay(record.start));
  if (currentFilter === "alcohol") return sorted.filter((record) => record.alcohol);
  return sorted;
}

function renderRecords() {
  const list = filteredRecords();
  $("#emptyState").hidden = list.length > 0;
  $("#mealList").innerHTML = list.map((record) => {
    const photo = record.photo
      ? `<img class="meal-photo" src="${record.photo}" alt="${mealNames[record.type]}の写真">`
      : `<div class="meal-photo-placeholder" aria-hidden="true">${mealSymbols[record.type]}</div>`;
    const syncLine = record.syncHash === recordSyncHash(record)
      ? '<p class="sync-line">Sheets同期済み</p>'
      : '<p class="sync-line pending">Sheets未同期</p>';
    return `<article class="meal-card" data-id="${record.id}" tabindex="0" role="button" aria-label="${mealNames[record.type]}を編集">
      ${photo}
      <div>
        <h3>${mealNames[record.type]} ${record.alcohol ? '<span class="alcohol-mark">・飲酒</span>' : ""}</h3>
        <p class="meal-meta">${formatDate(record.start)}　${formatTime(record.start)}-${formatTime(record.end)}</p>
        ${syncLine}
        ${record.note ? `<p class="meal-note">${escapeHtml(record.note)}</p>` : ""}
      </div>
      <div class="duration">${minutesBetween(record.start, record.end)}<small>分</small></div>
    </article>`;
  }).join("");
}

function startMeal() {
  const active = {
    id: crypto.randomUUID(),
    type: selectedMeal,
    start: new Date().toISOString(),
    alcohol: $("#quickAlcohol").checked,
    photo: null
  };
  setActiveMeal(active);
  renderActiveMeal();
  showToast(`${mealNames[active.type]}の記録を始めました`);
}

async function stopMeal() {
  const active = getActiveMeal();
  if (!active) return;
  const record = { ...active, end: new Date().toISOString(), note: "", createdAt: new Date().toISOString() };
  await putRecord(record);
  setActiveMeal(null);
  records = await getAllRecords();
  $("#quickAlcohol").checked = false;
  render();
  showToast("食事を記録しました");
  syncAfterChange();
}

function openRecordDialog(record = null) {
  dialogPhoto = record?.photo || null;
  $("#recordId").value = record?.id || "";
  $("#dialogTitle").textContent = record ? "記録を編集" : "食事を手動追加";
  $("#mealType").value = record?.type || "breakfast";
  const end = record?.end || new Date().toISOString();
  const start = record?.start || new Date(Date.now() - 30 * 60000).toISOString();
  $("#startTime").value = toLocalInput(start);
  $("#endTime").value = toLocalInput(end);
  $("#alcohol").checked = record?.alcohol || false;
  $("#note").value = record?.note || "";
  $("#photoInput").value = "";
  $("#photoPreview").src = dialogPhoto || "";
  $("#photoPreview").hidden = !dialogPhoto;
  $("#photoPickerText").textContent = dialogPhoto ? "写真を変更する" : "カメラで撮る／写真を選ぶ";
  $("#deleteButton").hidden = !record;
  $("#mealDialog").showModal();
}

async function saveDialogRecord() {
  const start = new Date($("#startTime").value);
  const end = new Date($("#endTime").value);
  if (!$("#startTime").value || !$("#endTime").value) return showToast("開始と終了を入力してください");
  if (end <= start) return showToast("終了は開始より後にしてください");

  const existing = records.find((record) => record.id === $("#recordId").value);
  const record = {
    id: existing?.id || crypto.randomUUID(),
    type: $("#mealType").value,
    start: start.toISOString(),
    end: end.toISOString(),
    alcohol: $("#alcohol").checked,
    note: $("#note").value.trim(),
    photo: dialogPhoto,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await putRecord(record);
  records = await getAllRecords();
  $("#mealDialog").close();
  render();
  showToast("記録を保存しました");
  syncAfterChange();
}

async function deleteDialogRecord() {
  const id = $("#recordId").value;
  if (!id || !confirm("この食事記録を削除しますか？")) return;
  queueDeletedSyncId(id);
  await removeRecord(id);
  records = await getAllRecords();
  $("#mealDialog").close();
  render();
  showToast("記録を削除しました");
  syncAfterChange();
}

async function syncToSheets({ silent = false } = {}) {
  const config = getSyncConfig();
  const endpoint = (config.endpoint || "").trim();
  if (!endpoint) {
    if (!silent) showToast("Sheets同期URLを設定してください");
    renderSyncPanel();
    return;
  }

  const deletes = getDeletedSyncIds();
  const upserts = records.filter((record) => record.syncHash !== recordSyncHash(record));
  if (!upserts.length && !deletes.length) {
    if (!silent) showToast("同期する変更はありません");
    renderSyncPanel();
    return;
  }

  const payload = {
    action: "sync",
    source: "meal-note-pwa",
    sentAt: new Date().toISOString(),
    upserts: upserts.map(toSheetRecord),
    deletes
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const syncedAt = new Date().toISOString();
    await Promise.all(upserts.map((record) => putRecord({
      ...record,
      syncHash: recordSyncHash(record),
      syncedAt
    })));
    setDeletedSyncIds([]);
    setSyncConfig({ ...config, endpoint, lastSyncedAt: syncedAt });
    records = await getAllRecords();
    render();
    if (!silent) showToast("Googleスプレッドシートへ同期しました");
  } catch (error) {
    console.error(error);
    renderSyncPanel();
    if (!silent) showToast("同期できませんでした。通信状態を確認してください");
  }
}

function syncAfterChange() {
  const config = getSyncConfig();
  if (config.endpoint && config.autoSync !== false && navigator.onLine) {
    syncToSheets({ silent: true });
  }
}

function sendBeaconSync() {
  const config = getSyncConfig();
  const endpoint = (config.endpoint || "").trim();
  if (!endpoint || !navigator.sendBeacon) return;
  const deletes = getDeletedSyncIds();
  const upserts = records.filter((record) => record.syncHash !== recordSyncHash(record));
  if (!upserts.length && !deletes.length) return;
  const payload = JSON.stringify({
    action: "sync",
    source: "meal-note-pwa",
    sentAt: new Date().toISOString(),
    upserts: upserts.map(toSheetRecord),
    deletes
  });
  navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain;charset=utf-8" }));
}

function bindEvents() {
  $$(".meal-chip").forEach((button) => button.addEventListener("click", () => {
    selectedMeal = button.dataset.meal;
    $$(".meal-chip").forEach((item) => item.classList.toggle("selected", item === button));
  }));
  $("#startButton").addEventListener("click", startMeal);
  $("#stopButton").addEventListener("click", stopMeal);
  $("#activePhotoButton").addEventListener("click", () => $("#activePhotoInput").click());
  $("#activePhotoInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const active = getActiveMeal();
    active.photo = await resizePhoto(file);
    setActiveMeal(active);
    renderActiveMeal();
    showToast("写真を追加しました");
  });
  $("#addManualButton").addEventListener("click", () => openRecordDialog());
  $("#saveButton").addEventListener("click", saveDialogRecord);
  $("#deleteButton").addEventListener("click", deleteDialogRecord);
  $("#photoInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    dialogPhoto = await resizePhoto(file);
    $("#photoPreview").src = dialogPhoto;
    $("#photoPreview").hidden = false;
    $("#photoPickerText").textContent = "写真を変更する";
  });
  $("#filters").addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;
    currentFilter = button.dataset.filter;
    $$(".filter").forEach((item) => item.classList.toggle("selected", item === button));
    renderRecords();
  });
  $("#mealList").addEventListener("click", (event) => {
    const card = event.target.closest(".meal-card");
    if (card) openRecordDialog(records.find((record) => record.id === card.dataset.id));
  });
  $("#mealList").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".meal-card");
    if (card) openRecordDialog(records.find((record) => record.id === card.dataset.id));
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#installButton").hidden = false;
  });
  $("#installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#installButton").hidden = true;
  });
  $("#saveSyncSettings").addEventListener("click", () => {
    const current = getSyncConfig();
    setSyncConfig({
      ...current,
      endpoint: $("#sheetEndpoint").value.trim(),
      autoSync: $("#autoSync").checked
    });
    renderSyncPanel();
    showToast("同期設定を保存しました");
  });
  $("#syncNowButton").addEventListener("click", () => syncToSheets());
  window.addEventListener("online", () => syncAfterChange());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sendBeaconSync();
  });
}

async function init() {
  const now = new Date();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  bindEvents();
  try {
    records = await getAllRecords();
  } catch (error) {
    console.error(error);
    showToast("端末内データを開けませんでした");
  }
  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
}

init();
