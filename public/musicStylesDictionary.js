// musicStylesDictionary.js — Synchronisé avec musicStylesDictionary.browser.js (ES Module)
import './musicStylesDictionary.browser.js';

const _rootScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

export const MUSIC_STYLES_DICTIONARY = _rootScope.MUSIC_STYLES_DICTIONARY || {};

export function getMusicStyleConfig(styleKeyOrLabel) {
  if (typeof _rootScope.getMusicStyleConfig === 'function') {
    return _rootScope.getMusicStyleConfig(styleKeyOrLabel);
  }
  return MUSIC_STYLES_DICTIONARY[styleKeyOrLabel] || MUSIC_STYLES_DICTIONARY.rumba_congolaise;
}
