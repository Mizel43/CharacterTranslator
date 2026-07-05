import { apiFetch, clearSessionArtifacts, hydrateCsrfToken } from './api.js';
import { createBlankProfile, prepareImportedProfiles, splitLines } from './profiles.js';
import { buildTranslateRequest } from './request-payload.js';
import {
  loadProfiles,
  loadSelectedProfileId,
  loadUiState,
  loadWorkspaceState,
  purgeLegacySecrets,
  saveProfiles,
  saveSelectedProfileId,
  saveUiState,
  saveWorkspaceState,
} from './state.js';
import {
  CONTROL_IDS,
  applyPresetToInputs,
  levelFor,
  readControls,
  syncControlLabels,
  updateControlOutputs,
} from './style-controls.js';

const DIRECTIONS = ['ru-en', 'en-ru'];
const MOBILE_LAYOUT_QUERY = '(max-width: 960px)';
const TOOLTIP_WIDTH = 320;

const DIRECTION_CONFIG = {
  'ru-en': {
    sourceLabel: 'Ваше сообщение (RU → EN)',
    sourcePlaceholder: 'Напишите фразу по-русски...',
    sourceEmptyError: 'Введите фразу по-русски.',
    sourceHint: 'Ctrl+Enter — перевести',
    translateLabel: 'Перевести',
    translateBusyLabel: 'Перевожу...',
    alternativeBusyLabel: 'Ищу другой вариант...',
    clearLabel: 'Стереть',
    resultLabel: 'Результат (EN)',
    copySuccess: 'Скопировано.',
    toneNote: 'ToneShift настраивает итоговый английский текст, не меняя смысл исходника.',
    cardNote: 'Открыть настройки персонажа',
    presetNote: 'Открыть ToneShift и модель',
  },
  'en-ru': {
    sourceLabel: 'English message (EN → RU)',
    sourcePlaceholder: 'Paste the English message here...',
    sourceEmptyError: 'Enter an English message first.',
    sourceHint: 'Ctrl+Enter — перевести',
    translateLabel: 'Перевести',
    translateBusyLabel: 'Перевожу на русский...',
    alternativeBusyLabel: 'Перевожу на русский...',
    clearLabel: 'Стереть',
    resultLabel: 'Результат (RU)',
    copySuccess: 'Скопировано.',
    toneNote: 'ToneShift не применяется к входящему переводу. Профиль, пресет и слайдеры не влияют на EN → RU.',
    cardNote: 'Не используется для EN → RU',
    presetNote: 'Не используется для EN → RU',
  },
};

const fallbackStyleConfig = {
  schemaVersion: 2,
  controls: {
    slang: { label: 'Сленг', levels: [{ value: 1, name: 'Легкий', tooltip: 'Легкий разговорный стиль.' }] },
    flirt: { label: 'Флирт', levels: [{ value: 0, name: 'Нет', tooltip: 'Без флирта.' }] },
    vulgarity: { label: 'Вульгарность', levels: [{ value: 0, name: 'Чисто', tooltip: 'Без грубости.' }] },
    sexualTension: { label: 'Сексуальный намек', levels: [{ value: 0, name: 'Нет', tooltip: 'Без сексуального подтекста.' }] },
    directness: { label: 'Прямота', levels: [{ value: 2, name: 'Нормально', tooltip: 'Естественная прямота.' }] },
  },
  presets: {
    casual_dm: { label: 'Casual DM', controls: { slang: 2, flirt: 1, vulgarity: 0, sexualTension: 0, directness: 2 } },
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  directionTabs: $$('[role="tab"][data-direction]'),
  modePanels: {
    'ru-en': $('#mode-panel-ru-en'),
    'en-ru': $('#mode-panel-en-ru'),
  },
  sourceLabel: $('#sourceLabel'),
  sourceText: $('#sourceText'),
  sourceHint: $('#sourceHint'),
  charCount: $('#charCount'),
  clearSource: $('#clearSourceButton'),
  translate: $('#translateButton'),
  preset: $('#presetSelect'),
  presetDirty: $('#presetDirty'),
  priority: $('#prioritySelect'),
  model: $('#modelSelect'),
  resultCard: $('#resultCard'),
  resultText: $('#resultText'),
  resultModel: $('#resultModel'),
  resultHeadingLabel: $('#resultHeadingLabel'),
  ruEnActions: $$('[data-ru-en-action]'),
  messageBox: $('#messageBox'),
  connectionButton: $('#connectionButton'),
  connectionDot: $('#connectionDot'),
  connectionText: $('#connectionText'),
  openSettingsButton: $('#openSettingsButton'),
  settingsDialog: $('#settingsDialog'),
  settingsProfileCount: $('#settingsProfileCount'),
  toneSidebar: $('#toneSidebar'),
  toneSidebarNote: $('#toneSidebarNote'),
  toneSidebarClose: $('#toneSidebarClose'),
  toneSidebarBackdrop: $('#toneSidebarBackdrop'),
  toneTooltip: $('#toneTooltip'),
  helpButtons: $$('[data-control-help]'),
  profileCard: $('#editProfile'),
  profileCardTitle: $('#characterCardTitle'),
  profileCardMeta: $('#characterCardMeta'),
  profileCardNote: $('#characterCardNote'),
  presetCard: $('#openToneSettings'),
  presetCardTitle: $('#presetCardTitle'),
  presetCardMeta: $('#presetCardMeta'),
  presetCardNote: $('#presetCardNote'),
  profileDialog: $('#profileDialog'),
  profileSelect: $('#profileSelect'),
  profileSummary: $('#profileSummary'),
  logoutButton: $('#logoutButton'),
};

let styleConfig = fallbackStyleConfig;
let profiles = loadProfiles();
let selectedProfileId = loadSelectedProfileId(profiles[0]?.id);
let uiState = loadUiState();
let workspaceState = loadWorkspaceState();
let controlsDirty = false;
let busyDirection = '';
let toneSidebarOpen = false;
let activeTooltipControl = '';
let messageTimer = null;

function currentDirection() {
  return workspaceState.activeDirection;
}

function currentWorkspace() {
  return workspaceState.workspaces[currentDirection()];
}

function ruEnWorkspace() {
  return workspaceState.workspaces['ru-en'];
}

function currentProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
}

function isMobileLayout() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function persistLocalState() {
  saveProfiles(profiles);
  saveSelectedProfileId(selectedProfileId);
  saveUiState(uiState);
}

function persistWorkspace() {
  saveWorkspaceState(workspaceState);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function syncBodyLock() {
  const anyDialogOpen = elements.profileDialog.open || elements.settingsDialog.open;
  document.body.classList.toggle('body-locked', anyDialogOpen || (toneSidebarOpen && isMobileLayout()));
}

function showMessage(text, type = 'info') {
  clearTimeout(messageTimer);
  elements.messageBox.textContent = text;
  elements.messageBox.classList.remove('hidden', 'error');
  if (type === 'error') elements.messageBox.classList.add('error');
  messageTimer = setTimeout(() => {
    elements.messageBox.classList.add('hidden');
  }, 2600);
}

function hideMessage() {
  clearTimeout(messageTimer);
  elements.messageBox.classList.add('hidden');
}

function updateSourceMeta() {
  const config = DIRECTION_CONFIG[currentDirection()];
  elements.charCount.textContent = String(elements.sourceText.value.length);
  elements.sourceHint.textContent = config.sourceHint;
}

function updatePresetDirtyMarker() {
  const shouldShow = currentDirection() === 'ru-en' && controlsDirty;
  elements.presetDirty.classList.toggle('hidden', !shouldShow);
}

function setConnection(state, text) {
  elements.connectionDot.classList.remove('ok', 'error');
  if (state) elements.connectionDot.classList.add(state);
  elements.connectionText.textContent = text;
}

function updateResultActions() {
  const direction = currentDirection();
  const hasResult = Boolean(currentWorkspace().resultText);
  const busy = busyDirection === direction;

  $('#copyResult').disabled = busy || !hasResult;
  for (const button of elements.ruEnActions) {
    const enabled = direction === 'ru-en';
    button.classList.toggle('hidden', !enabled);
    button.disabled = busy || !hasResult || !enabled;
  }
}

function updateTranslateButton(action = 'translate') {
  const config = DIRECTION_CONFIG[currentDirection()];
  const busy = busyDirection === currentDirection();
  const busyLabel = action === 'alternative' ? config.alternativeBusyLabel : config.translateBusyLabel;
  elements.translate.textContent = busy ? busyLabel : config.translateLabel;
  elements.translate.disabled = busy;
}

function updateClearButton() {
  elements.clearSource.disabled = busyDirection === currentDirection() || !elements.sourceText.value;
}

function syncModelSelect(defaultModel = '') {
  const workspace = currentWorkspace();
  const options = [...elements.model.options].map((option) => option.value);
  const fallbackModel = options.includes(defaultModel) ? defaultModel : (options[0] || 'qwen3.7-max');
  if (!options.length) return;

  if (!options.includes(workspace.model)) {
    workspace.model = fallbackModel;
    persistWorkspace();
  }

  elements.model.value = workspace.model;
}

function updateSettingsSummary() {
  elements.settingsProfileCount.textContent = `Профилей: ${profiles.length}`;
}

function renderDialogProfileSummary(profile) {
  if (!profile) return;

  elements.profileSummary.innerHTML = [
    `<strong>${escapeHtml(profile.name)}, ${profile.age}</strong>`,
    `${escapeHtml(profile.region || 'United States')} • ${escapeHtml(profile.genderVoice || 'natural adult voice')}`,
    escapeHtml(profile.personality || 'Характер не указан'),
    `<small>${profile.examples?.length || 0} примеров речи</small>`,
  ].join('<br>');
}

function renderCharacterCard() {
  const profile = currentProfile();
  if (!profile) return;

  const isRuEn = currentDirection() === 'ru-en';
  elements.profileCardTitle.textContent = `${profile.name}, ${profile.age}`;
  elements.profileCardMeta.textContent = `${profile.region || 'United States'} • ${profile.genderVoice || 'natural adult voice'}`;
  elements.profileCardNote.textContent = isRuEn ? DIRECTION_CONFIG['ru-en'].cardNote : DIRECTION_CONFIG['en-ru'].cardNote;
  elements.profileCard.classList.toggle('is-muted', !isRuEn);
}

function summarizeControls(controls) {
  return `Сленг ${controls.slang} • Флирт ${controls.flirt} • Прямота ${controls.directness}`;
}

function renderPresetCard() {
  const preset = styleConfig.presets[uiState.presetId] || Object.values(styleConfig.presets)[0];
  const controls = readControls();
  const isRuEn = currentDirection() === 'ru-en';

  elements.presetCardTitle.textContent = preset?.label || 'Preset';
  elements.presetCardMeta.textContent = summarizeControls(controls);
  elements.presetCardNote.textContent = isRuEn ? DIRECTION_CONFIG['ru-en'].presetNote : DIRECTION_CONFIG['en-ru'].presetNote;
  elements.presetCard.classList.toggle('is-muted', !isRuEn);
}

function renderProfiles() {
  if (!profiles.length) profiles = loadProfiles();
  if (!profiles.some((profile) => profile.id === selectedProfileId)) selectedProfileId = profiles[0]?.id;

  elements.profileSelect.innerHTML = '';
  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === selectedProfileId;
    elements.profileSelect.append(option);
  }

  updateSettingsSummary();
  renderCharacterCard();
  renderDialogProfileSummary(currentProfile());
  persistLocalState();
}

function applyPreset(presetId, resetDirty = true) {
  const preset = styleConfig.presets[presetId] || Object.values(styleConfig.presets)[0];
  if (!preset) return;

  applyPresetToInputs(styleConfig, presetId);
  uiState.presetId = presetId;
  controlsDirty = false;

  if (resetDirty) {
    ruEnWorkspace().previousOutputs = [];
    ruEnWorkspace().lastRequest = null;
    persistWorkspace();
  }

  updateControlOutputs(styleConfig);
  persistLocalState();
  elements.preset.value = uiState.presetId;
  updatePresetDirtyMarker();
  renderPresetCard();
  if (activeTooltipControl) showToneTooltip(activeTooltipControl);
}

function renderPresets() {
  elements.preset.innerHTML = '';
  for (const [id, preset] of Object.entries(styleConfig.presets)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = preset.label;
    elements.preset.append(option);
  }

  if (!styleConfig.presets[uiState.presetId]) {
    uiState.presetId = Object.keys(styleConfig.presets)[0] || 'casual_dm';
  }

  elements.priority.value = uiState.priority || 'settings';
  applyPreset(uiState.presetId, false);
}

function renderTabs() {
  const direction = currentDirection();
  for (const tab of elements.directionTabs) {
    const active = tab.dataset.direction === direction;
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
    tab.disabled = Boolean(busyDirection);
    tab.classList.toggle('active', active);
  }

  for (const [key, panel] of Object.entries(elements.modePanels)) {
    if (!panel) continue;
    panel.hidden = key !== direction;
  }
}

function updateToneAvailability() {
  const isRuEn = currentDirection() === 'ru-en';
  elements.toneSidebar.classList.toggle('is-disabled', !isRuEn);
  elements.toneSidebarNote.textContent = DIRECTION_CONFIG[currentDirection()].toneNote;
  elements.preset.disabled = !isRuEn;
  elements.priority.disabled = !isRuEn;

  for (const id of CONTROL_IDS) {
    const input = document.getElementById(id);
    if (input) input.disabled = !isRuEn;
  }

  for (const button of elements.helpButtons) {
    button.disabled = !isRuEn;
    button.setAttribute('aria-expanded', 'false');
  }

  if (!isRuEn) hideToneTooltip();
}

function renderWorkspace() {
  const direction = currentDirection();
  const workspace = currentWorkspace();
  const config = DIRECTION_CONFIG[direction];

  renderTabs();
  updateToneAvailability();

  elements.sourceLabel.textContent = config.sourceLabel;
  elements.sourceText.placeholder = config.sourcePlaceholder;
  elements.sourceText.value = workspace.sourceText || '';
  elements.clearSource.textContent = config.clearLabel;
  elements.resultHeadingLabel.textContent = config.resultLabel;

  elements.resultText.textContent = workspace.resultText || '';
  elements.resultModel.textContent = workspace.resultModel || '';
  elements.resultCard.classList.toggle('hidden', !workspace.resultText);

  syncModelSelect(workspace.model);
  updateSourceMeta();
  updateTranslateButton();
  updateClearButton();
  updateResultActions();
  updatePresetDirtyMarker();
  renderCharacterCard();
  renderPresetCard();
}

function setActiveDirection(direction) {
  if (busyDirection || !DIRECTIONS.includes(direction) || direction === currentDirection()) return;
  workspaceState.activeDirection = direction;
  persistWorkspace();
  hideMessage();
  renderWorkspace();
}

function collectRequest(action = 'translate') {
  const direction = currentDirection();
  const workspace = currentWorkspace();
  const text = elements.sourceText.value.trim();
  if (!text) throw new Error(DIRECTION_CONFIG[direction].sourceEmptyError);

  return buildTranslateRequest({
    direction,
    text,
    model: elements.model.value,
    action,
    presetId: elements.preset.value,
    priority: elements.priority.value,
    controls: readControls(),
    previous: {
      output: workspace.resultText || '',
      outputs: workspace.previousOutputs || [],
      controls: workspace.lastRequest?.controls || null,
    },
    profile: currentProfile(),
  });
}

function setBusy(busy, action = 'translate') {
  busyDirection = busy ? currentDirection() : '';
  updateTranslateButton(action);
  updateClearButton();
  updateResultActions();
  renderTabs();
}

async function loadStyleConfig() {
  try {
    const response = await fetch('/app/style-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    styleConfig = await response.json();
  } catch {
    styleConfig = fallbackStyleConfig;
  }
}

async function loadModels() {
  try {
    const data = await apiFetch('/api/models');
    const models = Array.isArray(data.models) && data.models.length ? data.models : [data.defaultModel];
    elements.model.innerHTML = '';

    for (const model of models) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      elements.model.append(option);
    }

    for (const direction of DIRECTIONS) {
      const workspace = workspaceState.workspaces[direction];
      if (!models.includes(workspace.model)) {
        workspace.model = data.defaultModel || models[0];
      }
    }
    persistWorkspace();
    syncModelSelect(data.defaultModel || models[0]);
  } catch {
    syncModelSelect(elements.model.value || 'qwen3.7-max');
  }
}

async function checkConnection(showSuccess = false) {
  setConnection('', 'Проверяю...');

  try {
    const health = await apiFetch('/api/health');
    if (!health.qwen) throw new Error(health.upstreamError || 'Qwen API не отвечает.');

    setConnection('ok', 'Подключено');
    if (showSuccess) showMessage('Gateway и Qwen доступны.');
    await loadModels();
    return true;
  } catch (error) {
    if (error.status === 401) {
      setConnection('error', 'Нужна привязка');
      showMessage('Сессия отсутствует или истекла. Откройте свежую ссылку /connect с компьютера, где запущен переводчик.', 'error');
    } else {
      setConnection('error', 'Ошибка');
      if (showSuccess) showMessage(error.message, 'error');
    }
    return false;
  }
}

async function translate(action = 'translate') {
  if (currentDirection() === 'en-ru' && action !== 'translate') return;

  hideMessage();
  let request;
  try {
    request = collectRequest(action);
  } catch (error) {
    showMessage(error.message, 'error');
    return;
  }

  setBusy(true, action);

  try {
    const result = await apiFetch('/api/translate', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const workspace = currentWorkspace();
    workspace.sourceText = request.text;
    workspace.resultText = result.text;
    workspace.resultModel = result.model;
    workspace.resultMeta = result.meta || null;
    workspace.model = request.model || workspace.model;

    if (currentDirection() === 'ru-en') {
      workspace.previousOutputs = [result.text, ...workspace.previousOutputs.filter((item) => item !== result.text)].slice(0, 5);
      workspace.lastRequest = { controls: request.controls };
      controlsDirty = false;
      updateControlOutputs(styleConfig);
      renderPresetCard();
    }

    persistWorkspace();
    renderWorkspace();
    setConnection('ok', 'Подключено');
    if (toneSidebarOpen && isMobileLayout()) closeToneSidebar();
  } catch (error) {
    showMessage(error.message, 'error');
    setConnection('error', error.status === 401 ? 'Нужна привязка' : 'Ошибка');
  } finally {
    setBusy(false);
  }
}

function clearSourceText() {
  if (!elements.sourceText.value || busyDirection === currentDirection()) return;
  const workspace = currentWorkspace();
  workspace.sourceText = '';
  persistWorkspace();
  renderWorkspace();
}

function populateProfileForm(profile, { duplicate = false } = {}) {
  const source = structuredClone(profile || createBlankProfile());
  if (duplicate) {
    source.id = crypto.randomUUID();
    source.name = `${source.name} - копия`;
  }

  $('#profileDialogTitle').textContent = profile && !duplicate ? 'Редактировать профиль' : 'Новый профиль';
  $('#profileId').value = source.id;
  $('#profileName').value = source.name;
  $('#profileAge').value = source.age;
  $('#profileGenderVoice').value = source.genderVoice || '';
  $('#profileRegion').value = source.region || '';
  $('#profilePersonality').value = source.personality || '';
  $('#profileLore').value = source.lore || '';
  $('#profileBackground').value = source.background || '';
  $('#profileRelationship').value = source.relationshipToReader || '';
  $('#profileCommunicationStyle').value = source.communicationStyle || '';
  $('#profileExamples').value = (source.examples || []).join('\n');
  $('#profilePreferred').value = (source.preferredPhrases || []).join('\n');
  $('#profileBanned').value = (source.bannedPhrases || []).join('\n');
  $('#profileEmoji').value = String(source.emojiLevel ?? 1);
  $('#profileLength').value = source.messageLength || 'short';
  $('#profileLowercase').checked = Boolean(source.lowercase);
  $('#deleteProfile').classList.toggle('hidden', !profile || duplicate);

  if (profile && elements.profileSelect.querySelector(`option[value="${profile.id}"]`)) {
    elements.profileSelect.value = profile.id;
  }

  renderDialogProfileSummary(source);
}

function openProfileDialog(profile = currentProfile(), duplicate = false) {
  populateProfileForm(profile, { duplicate });
  if (!elements.profileDialog.open) elements.profileDialog.showModal();
  syncBodyLock();
}

function saveProfileFromForm(event) {
  event.preventDefault();

  const age = Number($('#profileAge').value);
  if (age < 18) {
    showMessage('Возраст персонажа должен быть 18 или больше.', 'error');
    return;
  }

  const profile = {
    id: $('#profileId').value || crypto.randomUUID(),
    name: $('#profileName').value.trim(),
    age,
    genderVoice: $('#profileGenderVoice').value.trim(),
    region: $('#profileRegion').value.trim(),
    personality: $('#profilePersonality').value.trim(),
    lore: $('#profileLore').value.trim(),
    background: $('#profileBackground').value.trim(),
    relationshipToReader: $('#profileRelationship').value.trim(),
    communicationStyle: $('#profileCommunicationStyle').value.trim(),
    examples: splitLines($('#profileExamples').value),
    preferredPhrases: splitLines($('#profilePreferred').value),
    bannedPhrases: splitLines($('#profileBanned').value),
    emojiLevel: Number($('#profileEmoji').value),
    messageLength: $('#profileLength').value,
    lowercase: $('#profileLowercase').checked,
  };

  if (!profile.name) return;

  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);

  selectedProfileId = profile.id;
  renderProfiles();
  elements.profileDialog.close();
  syncBodyLock();
}

function deleteCurrentProfile() {
  const id = $('#profileId').value;
  if (profiles.length <= 1) {
    showMessage('Должен остаться хотя бы один профиль.', 'error');
    return;
  }

  if (!confirm('Удалить этот профиль?')) return;
  profiles = profiles.filter((profile) => profile.id !== id);
  selectedProfileId = profiles[0].id;
  renderProfiles();
  elements.profileDialog.close();
  syncBodyLock();
}

function exportProfiles() {
  const blob = new Blob([JSON.stringify({ version: 2, profiles }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `character-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importProfiles(file) {
  try {
    const payload = JSON.parse(await file.text());
    profiles = prepareImportedProfiles(payload);
    selectedProfileId = profiles[0].id;
    renderProfiles();
    showMessage(`Импортировано профилей: ${profiles.length}.`);
  } catch (error) {
    showMessage(`Ошибка импорта: ${error.message}`, 'error');
  }
}

async function logout() {
  try {
    await apiFetch('/api/session/logout', { method: 'POST' });
  } catch {
    // Ignore logout failures and clear local session artifacts anyway.
  }

  clearSessionArtifacts();
  location.assign('/connect');
}

function handleTabKeydown(event) {
  if (busyDirection) return;
  const index = elements.directionTabs.indexOf(event.currentTarget);
  if (index < 0) return;

  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + elements.directionTabs.length) % elements.directionTabs.length;
    elements.directionTabs[nextIndex].focus();
    event.preventDefault();
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    setActiveDirection(event.currentTarget.dataset.direction);
    event.preventDefault();
  }
}

function openSettingsDialog() {
  elements.settingsDialog.showModal();
  syncBodyLock();
}

function openToneSettings() {
  if (isMobileLayout()) {
    toneSidebarOpen = true;
    elements.toneSidebar.classList.add('open');
    elements.toneSidebarBackdrop.classList.remove('hidden');
    syncBodyLock();
    return;
  }

  elements.toneSidebar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  elements.preset.focus();
}

function closeToneSidebar() {
  toneSidebarOpen = false;
  elements.toneSidebar.classList.remove('open');
  elements.toneSidebarBackdrop.classList.add('hidden');
  syncBodyLock();
}

function tooltipMarkup(controlId) {
  const control = styleConfig.controls[controlId];
  if (!control) return '';
  const input = document.getElementById(controlId);
  const activeLevel = levelFor(styleConfig, controlId, input?.value);

  const levels = control.levels
    .map((level) => `
      <li class="${Number(level.value) === Number(input?.value || 0) ? 'active' : ''}">
        <span>${level.value}</span>
        <strong>${escapeHtml(level.name || '')}</strong>
      </li>
    `)
    .join('');

  return `
    <p class="tooltip-title">${escapeHtml(control.label)}</p>
    <p class="tooltip-copy">${escapeHtml(activeLevel.tooltip || '')}</p>
    <ul class="tooltip-levels">${levels}</ul>
  `;
}

function positionToneTooltip(button) {
  const sidebarRect = elements.toneSidebar.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();

  if (isMobileLayout()) return;

  const width = Math.min(TOOLTIP_WIDTH, sidebarRect.width - 32);
  const tooltip = elements.toneTooltip;
  const maxLeft = Math.max(16, sidebarRect.width - width - 16);
  const left = Math.max(16, Math.min(buttonRect.right - sidebarRect.left - width, maxLeft));
  let top = buttonRect.bottom - sidebarRect.top + 12;

  tooltip.style.width = `${width}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;

  const tooltipRect = tooltip.getBoundingClientRect();
  if (tooltipRect.bottom > window.innerHeight - 16) {
    top = Math.max(16, buttonRect.top - sidebarRect.top - tooltipRect.height - 12);
    tooltip.style.top = `${top}px`;
  }
}

function showToneTooltip(controlId) {
  if (currentDirection() !== 'ru-en') return;

  const button = document.querySelector(`[data-control-help="${controlId}"]`);
  if (!button) return;

  activeTooltipControl = controlId;
  elements.toneTooltip.innerHTML = tooltipMarkup(controlId);
  elements.toneTooltip.classList.remove('hidden');
  elements.toneTooltip.setAttribute('aria-hidden', 'false');

  for (const helpButton of elements.helpButtons) {
    helpButton.setAttribute('aria-expanded', helpButton === button ? 'true' : 'false');
  }

  requestAnimationFrame(() => positionToneTooltip(button));
}

function hideToneTooltip() {
  activeTooltipControl = '';
  elements.toneTooltip.classList.add('hidden');
  elements.toneTooltip.setAttribute('aria-hidden', 'true');
  for (const helpButton of elements.helpButtons) {
    helpButton.setAttribute('aria-expanded', 'false');
  }
}

function bindTooltipEvents() {
  for (const button of elements.helpButtons) {
    const controlId = button.dataset.controlHelp;
    if (!controlId) continue;

    button.addEventListener('mouseenter', () => {
      if (!isMobileLayout()) showToneTooltip(controlId);
    });
    button.addEventListener('mouseleave', () => {
      if (!isMobileLayout()) hideToneTooltip();
    });
    button.addEventListener('focus', () => showToneTooltip(controlId));
    button.addEventListener('blur', () => {
      if (!isMobileLayout()) hideToneTooltip();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (activeTooltipControl === controlId) hideToneTooltip();
      else showToneTooltip(controlId);
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!activeTooltipControl) return;
    if (elements.toneTooltip.contains(event.target)) return;
    if (event.target.closest('[data-control-help]')) return;
    hideToneTooltip();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideToneTooltip();
      if (toneSidebarOpen && isMobileLayout()) closeToneSidebar();
    }
  });
}

function bindEvents() {
  elements.directionTabs.forEach((tab) => {
    tab.addEventListener('click', () => setActiveDirection(tab.dataset.direction));
    tab.addEventListener('keydown', handleTabKeydown);
  });

  elements.profileSelect.addEventListener('change', () => {
    selectedProfileId = elements.profileSelect.value;
    renderProfiles();
    if (elements.profileDialog.open) {
      populateProfileForm(currentProfile(), { duplicate: false });
    }
  });

  elements.preset.addEventListener('change', () => applyPreset(elements.preset.value));
  elements.priority.addEventListener('change', () => {
    uiState.priority = elements.priority.value;
    persistLocalState();
  });
  elements.model.addEventListener('change', () => {
    currentWorkspace().model = elements.model.value;
    persistWorkspace();
  });
  elements.sourceText.addEventListener('input', () => {
    currentWorkspace().sourceText = elements.sourceText.value;
    persistWorkspace();
    updateSourceMeta();
    updateClearButton();
  });
  elements.sourceText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') translate('translate');
  });

  elements.clearSource.addEventListener('click', clearSourceText);
  elements.translate.addEventListener('click', () => translate('translate'));
  elements.connectionButton.addEventListener('click', () => checkConnection(true));
  elements.openSettingsButton.addEventListener('click', openSettingsDialog);
  elements.profileCard.addEventListener('click', () => openProfileDialog(currentProfile()));
  elements.presetCard.addEventListener('click', openToneSettings);
  elements.toneSidebarClose.addEventListener('click', closeToneSidebar);
  elements.toneSidebarBackdrop.addEventListener('click', closeToneSidebar);
  elements.logoutButton.addEventListener('click', logout);

  document.getElementById('newProfile').addEventListener('click', () => openProfileDialog(null));
  document.getElementById('duplicateProfile').addEventListener('click', () => openProfileDialog(currentProfile(), true));
  document.getElementById('profileForm').addEventListener('submit', saveProfileFromForm);
  document.getElementById('deleteProfile').addEventListener('click', deleteCurrentProfile);
  document.getElementById('exportProfiles').addEventListener('click', exportProfiles);
  document.getElementById('importProfiles').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importProfiles(file);
    event.target.value = '';
  });

  document.getElementById('regenerateResult').addEventListener('click', () => translate('alternative'));
  document.getElementById('shorterResult').addEventListener('click', () => translate('shorter'));
  document.getElementById('softerResult').addEventListener('click', () => translate('softer'));
  document.getElementById('bolderResult').addEventListener('click', () => translate('bolder'));
  document.getElementById('moreVulgarResult').addEventListener('click', () => translate('more_vulgar'));
  document.getElementById('copyResult').addEventListener('click', async () => {
    if (!currentWorkspace().resultText) return;
    await navigator.clipboard.writeText(currentWorkspace().resultText);
    showMessage(DIRECTION_CONFIG[currentDirection()].copySuccess);
  });

  for (const id of CONTROL_IDS) {
    document.getElementById(id)?.addEventListener('input', () => {
      controlsDirty = true;
      updateControlOutputs(styleConfig);
      updatePresetDirtyMarker();
      renderPresetCard();
      if (activeTooltipControl === id) showToneTooltip(id);
    });
  }

  document.querySelectorAll('.dialog-close').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('dialog')?.close();
      syncBodyLock();
    });
  });

  elements.profileDialog.addEventListener('close', syncBodyLock);
  elements.settingsDialog.addEventListener('close', syncBodyLock);

  window.addEventListener('resize', () => {
    if (!isMobileLayout()) closeToneSidebar();
    if (activeTooltipControl) showToneTooltip(activeTooltipControl);
  });

  bindTooltipEvents();
}

async function init() {
  purgeLegacySecrets();
  hydrateCsrfToken();
  await loadStyleConfig();
  renderProfiles();
  renderPresets();
  syncControlLabels(styleConfig);
  updateControlOutputs(styleConfig);
  bindEvents();
  renderWorkspace();
  await checkConnection(false);
}

init();
