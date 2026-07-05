import { createDefaultProfiles, migrateProfiles } from './profiles.js';

const LOCAL_STORAGE = {
  profiles: 'qct.profiles.v1',
  selectedProfile: 'qct.selectedProfile.v1',
  ui: 'qct.ui.v4',
};

const SESSION_STORAGE = {
  workspace: 'qct.workspace.v1',
};

const LEGACY_KEYS = [
  'qct.settings.v1',
  'qct.settings.v2',
  'qct.gateway.v1',
  'qct.accessToken',
];

function loadJson(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function createDefaultWorkspaceState() {
  return {
    schemaVersion: 1,
    activeDirection: 'ru-en',
    workspaces: {
      'ru-en': {
        sourceText: '',
        resultText: '',
        resultModel: '',
        resultMeta: null,
        previousOutputs: [],
        lastRequest: null,
        model: 'qwen3.7-max',
      },
      'en-ru': {
        sourceText: '',
        resultText: '',
        resultModel: '',
        resultMeta: null,
        model: 'qwen3.7-max',
      },
    },
  };
}

function normalizeWorkspace(value = {}) {
  return {
    sourceText: String(value?.sourceText || ''),
    resultText: String(value?.resultText || ''),
    resultModel: String(value?.resultModel || ''),
    resultMeta: value?.resultMeta && typeof value.resultMeta === 'object' ? value.resultMeta : null,
    previousOutputs: Array.isArray(value?.previousOutputs) ? value.previousOutputs.map((item) => String(item)).slice(0, 5) : [],
    lastRequest: value?.lastRequest && typeof value.lastRequest === 'object'
      ? {
        controls: value.lastRequest.controls && typeof value.lastRequest.controls === 'object'
          ? { ...value.lastRequest.controls }
          : null,
      }
      : null,
    model: String(value?.model || 'qwen3.7-max'),
  };
}

function normalizeWorkspaceState(value) {
  const fallback = createDefaultWorkspaceState();
  const activeDirection = value?.activeDirection === 'en-ru' ? 'en-ru' : 'ru-en';

  return {
    schemaVersion: 1,
    activeDirection,
    workspaces: {
      'ru-en': normalizeWorkspace({ ...fallback.workspaces['ru-en'], ...value?.workspaces?.['ru-en'] }),
      'en-ru': normalizeWorkspace({ ...fallback.workspaces['en-ru'], ...value?.workspaces?.['en-ru'] }),
    },
  };
}

export function purgeLegacySecrets() {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

export function loadProfiles() {
  return migrateProfiles(loadJson(localStorage, LOCAL_STORAGE.profiles, createDefaultProfiles()));
}

export function saveProfiles(profiles) {
  localStorage.setItem(LOCAL_STORAGE.profiles, JSON.stringify(profiles));
}

export function loadSelectedProfileId(fallbackId = '') {
  return localStorage.getItem(LOCAL_STORAGE.selectedProfile) || fallbackId;
}

export function saveSelectedProfileId(profileId) {
  localStorage.setItem(LOCAL_STORAGE.selectedProfile, profileId || '');
}

export function loadUiState() {
  return loadJson(localStorage, LOCAL_STORAGE.ui, {
    schemaVersion: 4,
    presetId: 'casual_dm',
    priority: 'settings',
  });
}

export function saveUiState(uiState) {
  localStorage.setItem(LOCAL_STORAGE.ui, JSON.stringify(uiState));
}

export function loadWorkspaceState() {
  return normalizeWorkspaceState(loadJson(sessionStorage, SESSION_STORAGE.workspace, createDefaultWorkspaceState()));
}

export function saveWorkspaceState(workspaceState) {
  sessionStorage.setItem(SESSION_STORAGE.workspace, JSON.stringify(normalizeWorkspaceState(workspaceState)));
}
