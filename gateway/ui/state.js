import { createDefaultProfiles, migrateProfiles } from './profiles.js';

const STORAGE = {
  profiles: 'qct.profiles.v1',
  selectedProfile: 'qct.selectedProfile.v1',
  ui: 'qct.ui.v3',
};

const LEGACY_KEYS = [
  'qct.settings.v1',
  'qct.settings.v2',
  'qct.gateway.v1',
  'qct.accessToken',
];

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function purgeLegacySecrets() {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

export function loadProfiles() {
  return migrateProfiles(loadJson(STORAGE.profiles, createDefaultProfiles()));
}

export function saveProfiles(profiles) {
  localStorage.setItem(STORAGE.profiles, JSON.stringify(profiles));
}

export function loadSelectedProfileId(fallbackId = '') {
  return localStorage.getItem(STORAGE.selectedProfile) || fallbackId;
}

export function saveSelectedProfileId(profileId) {
  localStorage.setItem(STORAGE.selectedProfile, profileId || '');
}

export function loadUiState() {
  return loadJson(STORAGE.ui, {
    schemaVersion: 2,
    presetId: 'casual_dm',
    priority: 'settings',
  });
}

export function saveUiState(uiState) {
  localStorage.setItem(STORAGE.ui, JSON.stringify(uiState));
}
