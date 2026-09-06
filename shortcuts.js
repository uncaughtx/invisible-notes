// App-scoped shortcuts. Listening on a Ghost Notes window's webContents keeps
// these bindings inactive while another app has focus, so common shortcuts
// such as Cmd+Shift+N remain available to browsers and IDEs.
const platform = require('./platform');

// Single source of truth for every shortcut the app answers to. The input
// matcher, the tray menu accelerators and the in-app legend are all derived
// from this list, so a shortcut can never be advertised as one thing while
// doing another.
//
// `scope` separates the app-scoped bindings — live only while a Ghost Notes
// window has focus — from the single global binding, which stays registered
// system-wide so there is always a way back in when every window is hidden.
// App-scoped bindings all share the CommandOrControl+Shift modifiers that
// shortcutNameForInput checks; only the final key differs.
//
// Order is the order the legend lists them in, and follows the tray menu.
const SHORTCUTS = [
  {
    id: 'newNote',
    scope: 'app',
    accelerator: 'CommandOrControl+Shift+N',
    label: 'New note',
    description: 'Drops a fresh note next to the cursor.'
  },
  {
    id: 'openManager',
    scope: 'app',
    accelerator: 'CommandOrControl+Shift+M',
    label: 'Notes Manager',
    description: 'Every note you have saved, open or hidden.'
  },
  {
    id: 'toggleHideAll',
    scope: 'app',
    accelerator: 'CommandOrControl+Shift+H',
    label: 'Hide / show all notes',
    description: 'Hiding keeps the contents — notes reopen exactly where they were.'
  },
  {
    id: 'toggleGhostAll',
    scope: 'app',
    accelerator: 'CommandOrControl+Shift+G',
    label: 'Toggle click-through',
    description: 'Clicks pass straight through your notes. Hover a note bar to interact again.'
  },
  {
    id: 'newNoteAnywhere',
    scope: 'global',
    accelerator: 'CommandOrControl+Alt+Shift+N',
    label: 'New note from anywhere',
    description: 'The only shortcut that works while another app has focus, so a new note is always reachable.'
  }
];

const APP_SHORTCUTS = SHORTCUTS.filter((shortcut) => shortcut.scope === 'app');
const GLOBAL_SHORTCUT = SHORTCUTS.find((shortcut) => shortcut.scope === 'global');

const FALLBACK_BINDING = GLOBAL_SHORTCUT.accelerator;

let activeOverrides = {};

function resolveShortcuts(overrides = activeOverrides) {
  return SHORTCUTS.map((shortcut) => {
    const accelerator = overrides[shortcut.id] || shortcut.accelerator;
    return {
      ...shortcut,
      accelerator,
      defaultAccelerator: shortcut.accelerator,
      isCustom: Boolean(overrides[shortcut.id] && overrides[shortcut.id] !== shortcut.accelerator)
    };
  });
}

// id -> accelerator, for callers that only need the string.
let BINDINGS = Object.fromEntries(
  resolveShortcuts().filter((s) => s.scope === 'app').map((s) => [s.id, s.accelerator])
);

// The matcher keys off the final segment of the accelerator rather than a
// field of its own, so the key the app listens for and the key the legend
// prints cannot drift apart.
function keyOf(accelerator) {
  const parts = accelerator.split('+');
  return parts[parts.length - 1];
}

let ACTION_BY_KEY = {};
let ACTION_BY_CODE = {};

function buildLookupTables(overrides = activeOverrides) {
  const appShortcuts = resolveShortcuts(overrides).filter((s) => s.scope === 'app');
  ACTION_BY_KEY = Object.fromEntries(
    appShortcuts.map((s) => [keyOf(s.accelerator).toLowerCase(), s.id])
  );
  ACTION_BY_CODE = Object.fromEntries(
    appShortcuts.map((s) => [`Key${keyOf(s.accelerator).toUpperCase()}`, s.id])
  );
  BINDINGS = Object.fromEntries(
    appShortcuts.map((s) => [s.id, s.accelerator])
  );
}

buildLookupTables();

function applyOverrides(overrides = {}) {
  activeOverrides = { ...overrides };
  buildLookupTables(activeOverrides);
}

// The list every UI reads from — the tray menu and the legend in the Notes
// Manager — with a platform-formatted `display` string so no caller has to
// know how to render an accelerator.
//
// Issue #5 (customizable shortcuts) resolves user overrides on top of these
// defaults. Keeping the definitions in one list, and deriving the matcher's
// lookup tables from it instead of hand-maintaining a parallel copy, is what
// makes that a change in one place rather than four.
function getShortcuts(overrides = activeOverrides) {
  return resolveShortcuts(overrides).map((shortcut) => ({
    ...shortcut,
    display: platform.formatAccelerator(shortcut.accelerator)
  }));
}

function shortcutNameForInput(input) {
  if (!input || input.type !== 'keyDown' || input.isAutoRepeat) return null;
  if (!platform.isCommandOrControlPressed(input) || !input.shift || input.alt) return null;
  if (input.code) return ACTION_BY_CODE[input.code] || null;
  return ACTION_BY_KEY[String(input.key || '').toLowerCase()] || null;
}

function registerShortcuts(win, actions) {
  win.webContents.on('before-input-event', (event, input) => {
    const name = shortcutNameForInput(input);
    const handler = name && actions[name];
    if (!handler) return;
    event.preventDefault();
    handler();
  });
}

function registerFallbackShortcut(globalShortcut, handler, customBinding) {
  const binding = customBinding || activeOverrides[GLOBAL_SHORTCUT.id] || FALLBACK_BINDING;
  const registered = globalShortcut.register(binding, handler);
  if (!registered) {
    console.warn(`Fallback shortcut ${binding} could not be registered — likely in use by another app.`);
  }
  return registered;
}

function unregisterFallbackShortcut(globalShortcut, customBinding) {
  const binding = customBinding || activeOverrides[GLOBAL_SHORTCUT.id] || FALLBACK_BINDING;
  globalShortcut.unregister(binding);
}

module.exports = {
  SHORTCUTS,
  registerShortcuts,
  registerFallbackShortcut,
  unregisterFallbackShortcut,
  shortcutNameForInput,
  getShortcuts,
  applyOverrides,
  get BINDINGS() { return BINDINGS; },
  FALLBACK_BINDING
};
