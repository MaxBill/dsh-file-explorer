window.__ModuleLoader__.load({
  id: "dsh-file-explorer",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";

    var React = require("react");
    var h = React.createElement;
    var Fragment = React.Fragment;
    var useCallback = React.useCallback;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useRef = React.useRef;
    var useState = React.useState;

    /** Identity shared by the sidebar entry and the main panel it opens. */
    var PANEL_ID = "dsh-file-explorer";
    /** Host route prefix served by lib/index.js. */
    var API = "/api/file-explorer";
    var STYLE_ID = "dsh-file-explorer-style";

    /** Remembered navigation, clipboard and view so switching panels does not lose them. */
    var remembered = { path: null, clipboard: null, view: null };

    /** localStorage key holding the chosen view mode. */
    var VIEW_KEY = "dsh-file-explorer:view";

    /** The ways a folder can be shown, in switcher order (icons is the default). */
    var VIEW_MODES = ["icons", "list"];

    /** Labels and icons for the view switcher. */
    var VIEW_OPTIONS = [
      { id: "icons", label: "图标", icon: "viewGrid" },
      { id: "list", label: "列表", icon: "viewList" },
    ];

    /**
     * Read the remembered view mode, tolerating unavailable storage.
     * @returns {string|null} a valid mode, or null
     */
    function readStoredView() {
      try {
        var stored = window.localStorage ? window.localStorage.getItem(VIEW_KEY) : null;
        return VIEW_MODES.indexOf(stored) === -1 ? null : stored;
      } catch (error) {
        return null;
      }
    }

    /**
     * Persist the view mode for the next session.
     * @param {string} view - one of VIEW_MODES
     */
    function storeView(view) {
      try {
        if (window.localStorage) window.localStorage.setItem(VIEW_KEY, view);
      } catch (error) {
        // Storage can be unavailable; the in-memory value still applies.
      }
    }


    var CSS = `
.dfx-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1b1b1b);
  font-size: 13px;
  line-height: 1.45;
}
.dfx-bar {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px 8px; flex: 0 0 auto;
  box-shadow: inset 0 -1px 0 var(--dfx-rule, rgba(127, 127, 127, .13));
}
.dfx-bar-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.dfx-navbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, #5c5c5c);
  cursor: pointer; flex: 0 0 auto;
}
.dfx-navbtn > span { display: inline-flex; align-items: center; justify-content: center; }
.dfx-navbtn svg { width: 16px; height: 16px; }
.dfx-navbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-navbtn:disabled { opacity: .35; cursor: default; }
.dfx-crumbs {
  display: flex; align-items: center; gap: 1px; flex: 1 1 auto; min-width: 0; overflow: hidden;
  height: 28px; padding: 0 6px; border-radius: 8px;
  background: rgba(127, 127, 127, .04);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}
.dfx-crumbs:hover { background: rgba(127, 127, 127, .07); }
.dfx-crumbs--edit, .dfx-crumbs--edit:hover {
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-border-brand, #3b6cf6);
}
.dfx-address {
  flex: 1 1 auto; min-width: 0; height: 22px; padding: 0 3px; border: 0; outline: none;
  background: transparent; color: var(--dsw-alias-label-primary, #1b1b1b);
  font: inherit; font-size: 12px; letter-spacing: .01em;
}
.dfx-crumb {
  flex: 0 0 auto; max-width: 180px; padding: 3px 7px; border: 0; border-radius: 7px;
  background: transparent; color: var(--dsw-alias-label-secondary, #5c5c5c);
  font: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
}
.dfx-crumb:hover { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-crumb--last { color: var(--dsw-alias-label-primary, #1b1b1b); font-weight: 600; cursor: default; }
.dfx-crumb--last:hover { background: transparent; }
.dfx-sep { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #9a9a9a); display: inline-flex; }
.dfx-search {
  display: flex; align-items: center; gap: 6px; flex: 0 1 260px; min-width: 140px; height: 28px; padding: 0 9px; box-sizing: border-box;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  background: var(--dsw-alias-bg-layer-2, #fafafa); color: var(--dsw-alias-label-secondary, #5c5c5c);
}
.dfx-search input { flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
.dfx-search input::-webkit-search-cancel-button { display: none; }
.dfx-toolbar {
  display: flex; align-items: center; gap: 2px; padding: 7px 10px; flex: 0 0 auto;
  box-shadow: inset 0 -1px 0 var(--dfx-rule, rgba(127, 127, 127, .13));
}
.dfx-tool {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px;
  border: 0; border-radius: 7px; background: transparent; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-secondary, #5c5c5c); cursor: pointer; white-space: nowrap;
}
.dfx-tool:hover:not(:disabled) { background: rgba(127, 127, 127, .13); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-tool:disabled { opacity: .38; cursor: default; }
.dfx-tool--open { background: rgba(127, 127, 127, .16); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-tool-label { line-height: 1; }
.dfx-root svg { display: block; flex: 0 0 auto; }
.dfx-toolbar-sep { width: 1px; height: 15px; margin: 0 6px; background: var(--dsw-alias-border-l1, rgba(0, 0, 0, .1)); flex: 0 0 auto; }
.dfx-popup { min-width: 190px; }
.dfx-body { display: flex; flex: 1 1 auto; min-height: 0; }
.dfx-listpane { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.dfx-head {
  display: grid; grid-template-columns: minmax(0, 1fr) 104px 92px 148px; align-items: center; gap: 12px;
  height: 26px; padding: 0 14px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 12px;
  box-shadow: inset 0 -1px 0 var(--dfx-rule, rgba(127, 127, 127, .13));
}
.dfx-headcell {
  display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; padding: 0;
  font: inherit; color: inherit; cursor: pointer; text-align: left;
}
.dfx-headcell:hover { color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-headcell--static { cursor: default; }
.dfx-headcell--static:hover { color: inherit; }
.dfx-rows { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px 0 10px; outline: none; }
.dfx-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 92px 148px; align-items: center; gap: 12px;
  height: 30px; padding: 0 14px; cursor: pointer; user-select: none;
  transition: background-color 120ms ease;
}
.dfx-row:hover { background: rgba(127, 127, 127, .13); }
.dfx-row:hover .dfx-name-text--dim { color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-row--sel, .dfx-row--sel:hover { background: var(--dsw-alias-bg-brand-weak, rgba(64, 110, 255, .12)); }
.dfx-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dfx-name-icon { flex: 0 0 auto; display: inline-flex; color: var(--dsw-alias-label-tertiary, #8b8b8b); }
.dfx-name-icon--folder { color: var(--dsw-alias-label-brand, #4b7bec); }
.dfx-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfx-name-text--dim { color: var(--dsw-alias-label-tertiary, #8f8f8f); }
.dfx-cell { color: var(--dsw-alias-label-secondary, #6f6f6f); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfx-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary, #8f8f8f); text-align: center; }
.dfx-notice { margin: 14px; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f7f7f7); border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)); color: var(--dsw-alias-label-secondary, #5c5c5c); }
.dfx-notice--error { border-color: var(--dsw-alias-border-danger, rgba(220, 60, 60, .35)); color: var(--dsw-alias-label-danger, #c0392b); }
.dfx-preview { display: flex; flex-direction: column; flex: 0 0 auto; width: 42%; min-width: 260px; max-width: 620px; min-height: 0; border-left: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)); background: var(--dsw-alias-bg-layer-2, #fbfbfb); }
.dfx-preview-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; flex: 0 0 auto; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07)); }
.dfx-preview-title { flex: 1 1 auto; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfx-preview-meta { padding: 8px 12px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.dfx-preview-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 12px 12px; }
.dfx-pre { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-image { display: block; max-width: 100%; border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)); }
.dfx-preview-foot { display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex: 0 0 auto; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07)); }
.dfx-panemode { display: flex; align-items: center; gap: 1px; padding: 2px; margin-left: auto; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f2f2f2); flex: 0 0 auto; }
.dfx-panemode button {
  height: 22px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary, #5c5c5c); font: inherit; font-size: 11px; cursor: pointer;
}
.dfx-panemode button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1b1b1b); box-shadow: 0 1px 2px rgba(0, 0, 0, .1); }
.dfx-panemode button:disabled { opacity: .38; cursor: default; box-shadow: none; background: transparent; }
.dfx-info { display: flex; flex-direction: column; padding: 2px 0 6px; }
.dfx-info-row {
  display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 10px; align-items: baseline;
  padding: 8px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06)); font-size: 12px;
}
.dfx-info-row:last-child { border-bottom: 0; }
.dfx-info-label { color: var(--dsw-alias-label-tertiary, #8f8f8f); }
.dfx-info-value { color: var(--dsw-alias-label-primary, #1b1b1b); word-break: break-all; font-variant-numeric: tabular-nums; user-select: text; }
.dfx-pill {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  background: transparent; color: var(--dsw-alias-label-secondary, #5c5c5c); font: inherit; font-size: 12px; cursor: pointer;
}
.dfx-pill:hover { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-foot-strong { color: var(--dsw-alias-label-primary, #1b1b1b); font-variant-numeric: tabular-nums; }
.dfx-foot-meta { font-variant-numeric: tabular-nums; }
.dfx-foot { display: flex; align-items: center; gap: 12px; height: 26px; padding: 0 14px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07)); }
.dfx-foot-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .5; }
.dfx-foot-error { color: var(--dsw-alias-label-danger, #c0392b); }
.dfx-spin { animation: dfx-spin 1s linear infinite; }
@keyframes dfx-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dfx-spin { animation: none; } }
.dfx-viewswitch {
  display: flex; align-items: center; gap: 1px; padding: 2px; margin-left: auto;
  border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f4f4f4); flex: 0 0 auto;
}
.dfx-panebtn { flex: 0 0 auto; }
.dfx-navbtn--active { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1b1b1b); box-shadow: 0 1px 2px rgba(0, 0, 0, .1); }
.dfx-row { grid-template-columns: minmax(0, 1fr) 104px 92px 148px; }
.dfx-rows--grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 2px; padding: 8px 12px 14px; align-content: start;
}
.dfx-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 6px;
  padding: 10px 6px 8px; border-radius: 10px; cursor: pointer; user-select: none;
  transition: background-color 120ms ease;
}
.dfx-tile:hover { background: rgba(127, 127, 127, .13); }
.dfx-tile:hover .dfx-name-text--dim { color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-tile--sel, .dfx-tile--sel:hover { background: var(--dsw-alias-bg-brand-weak, rgba(64, 110, 255, .12)); }
.dfx-tile-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; color: var(--dsw-alias-label-tertiary, #8b8b8b); }
.dfx-tile-icon--folder { color: var(--dsw-alias-label-brand, #4b7bec); }
.dfx-tile-name {
  max-width: 100%; font-size: 12px; line-height: 1.35; text-align: center; word-break: break-all;
  color: var(--dsw-alias-label-primary, #1b1b1b);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.dfx-menu {
  position: fixed; z-index: 90; min-width: 218px; max-height: calc(100vh - 16px); overflow: auto;
  padding: 5px; display: flex; flex-direction: column; gap: 1px; border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  box-shadow: 0 12px 34px rgba(0, 0, 0, .18);
}
.dfx-menu-item {
  display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 9px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary, #1b1b1b);
  font: inherit; text-align: left; cursor: pointer;
}
.dfx-menu-item:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); }
.dfx-menu-item:disabled { opacity: .38; cursor: default; }
.dfx-menu-item--danger { color: var(--dsw-alias-label-danger, #c0392b); }
.dfx-menu-item--danger:hover:not(:disabled) { background: var(--dsw-alias-bg-danger-weak, rgba(220, 60, 60, .1)); }
.dfx-menu-icon { display: inline-flex; justify-content: center; width: 16px; flex: none; color: var(--dsw-alias-label-tertiary, #8b8b8b); }
.dfx-menu-item--danger .dfx-menu-icon { color: inherit; }
.dfx-menu-label { flex: 1 1 auto; white-space: nowrap; }
.dfx-menu-hint { flex: none; color: var(--dsw-alias-label-tertiary, #9a9a9a); font-size: 11px; }
.dfx-menu-sep { height: 1px; margin: 4px 8px; background: var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)); }
.dfx-overlay { position: fixed; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .28); }
.dfx-dialog {
  width: min(420px, calc(100vw - 48px)); padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 10px;
  border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  box-shadow: 0 24px 64px rgba(0, 0, 0, .24);
}
.dfx-dialog-title { font-size: 15px; font-weight: 600; }
.dfx-dialog-label { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8f8f8f); }
.dfx-dialog-message { font-size: 13px; color: var(--dsw-alias-label-secondary, #5c5c5c); }
.dfx-dialog-input {
  height: 34px; padding: 0 10px; border-radius: 9px; font: inherit; outline: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .16));
  background: var(--dsw-alias-bg-layer-2, #fafafa); color: inherit;
}
.dfx-dialog-input:focus { border-color: var(--dsw-alias-border-brand, #4b7bec); }
.dfx-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.dfx-btn {
  height: 30px; padding: 0 14px; border-radius: 9px; font: inherit; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .14));
  background: transparent; color: inherit;
}
.dfx-btn:hover:not(:disabled):not(.dfx-btn--primary):not(.dfx-btn--danger) { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .05)); }
.dfx-btn:focus-visible { outline: 2px solid var(--dsw-alias-border-brand, #3b6cf6); outline-offset: 1px; }
.dfx-btn--primary { border-color: transparent; background: var(--dsw-alias-bg-brand, #3b6cf6); color: #fff; }
.dfx-btn--primary:hover:not(:disabled) { background: var(--dsw-alias-bg-brand-hover, #2f5ce0); }
.dfx-btn--primary:active:not(:disabled) { background: var(--dsw-alias-bg-brand-hover, #2f5ce0); filter: brightness(.94); }
.dfx-btn--danger { border-color: transparent; background: var(--dsw-alias-bg-danger, #d9534f); color: #fff; }
.dfx-btn--danger:hover:not(:disabled) { background: var(--dsw-alias-bg-danger-hover, #c5433f); }
.dfx-btn--danger:active:not(:disabled) { background: var(--dsw-alias-bg-danger-hover, #c5433f); filter: brightness(.92); }
.dfx-btn:disabled { opacity: .5; cursor: default; }
.dfx-about { width: 420px; }
.dfx-about-blurb { color: var(--dsw-alias-label-secondary, #5c5c5c); line-height: 1.6; }
.dfx-about-rows { display: flex; flex-direction: column; }
.dfx-about-row {
  display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px; align-items: baseline;
  padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .06)); font-size: 12px;
}
.dfx-about-row:last-child { border-bottom: 0; }
.dfx-about-label { color: var(--dsw-alias-label-tertiary, #8f8f8f); }
.dfx-about-value { color: var(--dsw-alias-label-primary, #1b1b1b); word-break: break-all; user-select: text; font-variant-numeric: tabular-nums; }
.dfx-about-note { color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 11px; }
`;

    /**
     * Build one icon element. Two kinds of artwork are supported:
     *   - a 24x24 stroke outline: an array of path data strings
     *   - supplied artwork: { viewBox, parts: [{ d, fill }] }, every part painted
     * @param {Array|object} artwork - path list, or { viewBox, parts }
     * @param {number|string} size - square edge in pixels ("100%" fills the box)
     * @returns {object} svg element
     */
    function icon(artwork, size) {
      if (Array.isArray(artwork)) {
        return h("svg", {
          width: size, height: size, viewBox: "0 0 24 24", fill: "none",
          stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
          "aria-hidden": "true", focusable: "false",
        }, artwork.map(function (d, index) { return h("path", { key: index, d: d }); }));
      }
      return h("svg", {
        width: size, height: size, viewBox: artwork.viewBox || "0 0 24 24",
        fill: "none", stroke: "none",
        "aria-hidden": "true", focusable: "false",
      }, (artwork.parts || []).map(function (part, index) {
        return h("path", {
          key: index,
          d: part.d,
          fill: part.fill || "currentColor",
          opacity: part.opacity,
          fillRule: part.fillRule,
        });
      }));
    }

    /** Named icon shapes (arrays of SVG path data). */
    var SHAPES = {
      folder: ["M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2.2h8.2A1.5 1.5 0 0 1 20 9.7v7.8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z"],
      // Supplied artwork: 1024-grid, one translucent body behind the solid tab.
      folderFilled: {
        viewBox: "26.8 26.8 969.3 969.3",
        parts: [
          { d: "M85.333333 296.533333c0-37.688889 0-56.490667 2.986667-72.192a170.666667 170.666667 0 0 1 135.964444-136.021333C240.071111 85.333333 258.929778 85.333333 296.533333 85.333333c16.469333 0 24.746667 0 32.682667 0.739556a170.666667 170.666667 0 0 1 93.013333 38.570667c6.144 5.063111 11.946667 10.865778 23.637334 22.556444L469.333333 170.666667c34.816 34.816 52.224 52.224 73.045334 63.772444 11.434667 6.4 23.608889 11.434667 36.181333 15.018667 22.954667 6.542222 47.559111 6.542222 96.768 6.542222h15.957333c112.298667 0 168.504889 0 204.970667 32.853333 3.384889 2.986667 6.570667 6.200889 9.557333 9.557334C938.666667 334.904889 938.666667 391.082667 938.666667 503.381333V597.333333c0 160.910222 0 241.351111-50.005334 291.328C838.684444 938.666667 758.243556 938.666667 597.333333 938.666667h-170.666666c-160.881778 0-241.379556 0-291.328-50.005334C85.333333 838.684444 85.333333 758.243556 85.333333 597.333333V296.533333z", fill: "#4096FF", opacity: ".5" },
          { d: "M853.333333 266.154667c0-12.714667-0.227556-20.252444-1.080889-26.88a128 128 0 0 0-110.193777-110.165334c-8.334222-1.109333-18.204444-1.109333-38.058667-1.109333h-277.845333c4.949333 4.437333 10.524444 9.984 19.712 19.2L469.333333 170.666667c34.816 34.816 52.224 52.224 73.045334 63.772444 11.463111 6.4 23.608889 11.434667 36.209777 15.018667 22.926222 6.542222 47.530667 6.542222 96.768 6.542222h15.928889c75.946667 0 126.151111 0 162.048 10.154667zM522.666667 426.666667a32 32 0 0 1 32-32H768a32 32 0 1 1 0 64h-213.333333A32 32 0 0 1 522.666667 426.666667z", fill: "#4096FF" },
        ],
      },
      // Anything the classifier does not recognise.
      fileOther: {
        viewBox: "-27.8 -27.8 1080.7 1080.7",
        parts: [
          { d: "M109.735331 854.410158A132.966758 132.966758 0 0 0 242.702089 987.376916h538.595822A132.966758 132.966758 0 0 0 914.264669 854.373588V307.183929L643.650255 36.569515H242.702089A132.966758 132.966758 0 0 0 109.735331 169.536273v684.873885z", fill: "#CCCDD2" },
          { d: "M643.650255 240.70055c0 36.715793 29.767586 66.483379 66.483379 66.483379H914.264669L643.650255 36.569515v204.131035z", fill: "#ABAEB8" },
          { d: "M658.278062 431.556851h-292.556124a29.255612 29.255612 0 0 1 0-58.511224h292.556124a29.255612 29.255612 0 0 1 0 58.511224z m0 146.278062h-292.556124a29.255612 29.255612 0 0 1 0-58.511225h292.556124a29.255612 29.255612 0 0 1 0 58.511225z m0 146.278062h-292.556124a29.255612 29.255612 0 0 1 0-58.511225h292.556124a29.255612 29.255612 0 0 1 0 58.511225z", fill: "#91949E" },
        ],
      },
      fileText: {
        viewBox: "-16.5 -14.5 1058 1058",
        parts: [
          { d: "M221.77 49.09c-64.496 0-116.51 52.014-116.51 116.51v698.01c0 64.496 52.014 116.51 116.51 116.51h582.02c63.975 0 115.99-52.014 115.99-116.51V339.84l-0.27-0.27H744.75c-4.031 0-8.016-0.203-11.94-0.6a116.896 116.896 0 0 1-11.59-1.76 115.992 115.992 0 0 1-21.89-6.78 115.838 115.838 0 0 1-10.19-4.89 116.129 116.129 0 0 1-9.6-5.83 116.626 116.626 0 0 1-24.75-22.48 116.456 116.456 0 0 1-6.7-8.96 116.206 116.206 0 0 1-5.82-9.61 115.923 115.923 0 0 1-8.81-20.9 116.698 116.698 0 0 1-4.62-22.76c-0.397-3.924-0.6-7.91-0.6-11.94l0.52-173.97H221.77z m442.15 0l-0.45 149.53c-0.044 18.255 4.672 36.507 13.69 52.39 11.504 20.48 30.028 36.915 51.75 45.86 13.318 5.547 27.781 8.254 42.2 8.08h148.67L663.92 49.09zM308.13 509.9c0.9 0.049 1.964-0.166 2.76 0.05l403.18-0.01c4.388-0.047 8.816-0.146 13.14 0.75 10.273 1.907 19.527 8.327 25.11 17.13 4.27 6.6 6.197 14.53 6.02 22.35 0.302 7.946-1.705 16.004-5.95 22.75-6.647 10.776-18.965 17.694-31.6 17.95-134.025 0.035-268.057 0.03-402.08 0.03-5.054-0.08-10.113 0.188-15.16-0.14-10.508-0.655-20.546-5.992-27.14-14.17-5.893-7.138-8.795-16.486-8.58-25.69-0.296-7.598 1.5-15.3 5.4-21.85 6.717-11.5 19.678-19.09 33.02-19.11l1.88-0.04z m0 222.62c0.9 0.049 1.964-0.176 2.76 0.04l399.81-0.01c5.371 0.09 10.791-0.369 16.1 0.68 10.249 1.788 19.551 8.05 25.22 16.75 4.48 6.68 6.501 14.804 6.32 22.8 0.299 7.921-1.69 15.947-5.91 22.68-6.647 10.82-19.005 17.778-31.68 18.02-133.97 0.035-267.941 0.03-401.91 0.03-5.084-0.079-10.175 0.182-15.25-0.14-10.594-0.645-20.704-6.054-27.31-14.33-5.8-7.123-8.664-16.39-8.45-25.53-0.298-7.617 1.511-15.348 5.43-21.91 6.723-11.462 19.66-19.024 32.97-19.05l1.9-0.03z", fill: "#72A9FE" },
        ],
      },
      filePdf: {
        viewBox: "-15.8 -6.3 1055.7 1055.7",
        parts: [
          { d: "M663.950222 56.888889H260.323556A146.545778 146.545778 0 0 0 113.777778 203.434667v635.505777a146.545778 146.545778 0 0 0 146.545778 146.545778h503.352888A146.545778 146.545778 0 0 0 910.222222 838.940444V303.104c0-32.995556-13.084444-64.625778-36.408889-87.950222L751.900444 93.297778c-23.324444-23.324444-55.011556-36.408889-88.007111-36.408889z", fill: "#FF7878" },
          { d: "M873.813333 215.153778L751.900444 93.297778a124.416 124.416 0 0 0-64.056888-34.133334v136.760889c0 43.463111 35.214222 78.620444 78.620444 78.620445h140.344889a124.472889 124.472889 0 0 0-33.109333-59.392z m-219.591111 350.435555c-23.665778 0-47.104 3.413333-70.712889 7.907556a338.488889 338.488889 0 0 1-69.404444-89.770667c19.114667-62.862222 20.138667-105.528889 5.632-125.724444a36.977778 36.977778 0 0 0-29.127111-14.563556 35.84 35.84 0 0 0-34.702222 17.976889c-20.195556 33.792 9.102222 100.124444 22.584888 126.976-15.530667 48.298667-34.702222 94.378667-59.335111 139.264-106.609778 46.08-108.828444 74.183111-108.828444 84.252445 0 12.344889 6.656 24.689778 19.000889 30.321777a29.752889 29.752889 0 0 0 16.725333 4.437334c28.046222 0 60.586667-31.516444 95.288889-93.297778 43.804444-18.033778 87.438222-32.597333 133.518222-42.666667 23.608889 20.195556 52.679111 31.516444 82.944 33.735111 19.228444 0 56.149333 0 55.751111-38.4 1.194667-14.563556-6.656-39.253333-59.392-40.391111z m-306.631111 147.114667l-3.413333 1.194667c9.955556-14.563556 23.096889-25.941333 39.822222-32.824889a70.542222 70.542222 0 0 1-36.408889 31.630222z m137.443556-334.279111c1.080889-1.137778 3.299556-2.389333 4.551111-2.389333l3.754666 1.194666c5.688889 19.114667 5.688889 39.253333-1.308444 58.083556-8.248889-17.863111-11.605333-37.944889-6.997333-56.888889z m58.254222 217.656889c-24.462222 5.688889-51.370667 13.653333-75.889778 22.641778l-2.503111 0.967111 0.284444-1.991111c12.288-24.860444 23.495111-50.972444 33.564445-77.027556l1.137778-2.56 1.251555 1.536c12.458667 19.171556 28.216889 38.912 45.056 55.808l-2.901333 0.625778z m115.256889 14.108444a92.330667 92.330667 0 0 1-33.564445-8.647111c10.012444-2.218667 18.887111-2.218667 28.899556-2.218667 22.357333 0 26.737778 5.518222 26.965333 8.704-6.656 2.161778-14.449778 3.356444-22.300444 2.161778z", fill: "#F25555" },
          { d: "M653.880889 586.922667c-10.069333 0-18.887111 0-28.956445 2.161777 11.264 5.518222 22.357333 7.68 33.564445 8.647112 7.907556 1.137778 15.701333 0 22.357333-2.161778-0.170667-3.128889-4.608-8.647111-26.965333-8.647111zM501.191111 527.189333l-1.194667-1.479111-1.251555 2.503111c-10.012444 26.112-21.276444 52.167111-33.507556 77.027556l-0.284444 2.048 2.503111-1.024c24.462222-8.988444 51.370667-16.896 75.889778-22.584889l2.844444-0.682667a355.896889 355.896889 0 0 1-44.999111-55.751111z m-7.793778-162.417777l-3.697777-1.194667c-1.308444 0-3.527111 1.194667-4.551112 2.446222-4.664889 18.887111-1.308444 38.968889 6.997334 56.888889 6.940444-18.944 6.940444-39.025778 1.251555-58.140444zM344.177778 701.44l3.413333-1.194667c15.530667-5.688889 27.648-16.782222 36.408889-31.573333-16.725333 6.826667-29.866667 18.204444-39.822222 32.768z m313.628444-69.404444a143.075556 143.075556 0 0 1-82.944-33.792c-46.08 10.069333-89.656889 24.632889-133.518222 42.666666-34.702222 61.838222-67.242667 93.297778-95.288889 93.297778a29.752889 29.752889 0 0 1-16.725333-4.380444 33.109333 33.109333 0 0 1-19.000889-30.321778c0-10.126222 2.218667-38.229333 108.828444-84.309334 24.632889-44.885333 43.804444-90.965333 59.335111-139.264-13.482667-26.908444-42.780444-93.184-22.584888-126.919111a35.84 35.84 0 0 1 34.702222-18.033777c11.377778 0 22.414222 5.688889 29.127111 14.563555 14.506667 20.252444 13.482667 62.862222-5.688889 125.724445a338.488889 338.488889 0 0 0 69.461333 89.770666 382.179556 382.179556 0 0 1 70.656-7.850666c52.736 1.137778 60.586667 25.827556 59.392 40.391111 0.398222 38.4-36.522667 38.4-55.751111 38.4z", fill: "#FFFFFF" },
        ],
      },
      fileWord: {
        viewBox: "2.9 2.9 1018.2 1018.2",
        parts: [
          { d: "M658.78 64.39H269.46c-78.06 0-141.33 63.28-141.33 141.33v612.95c0 78.06 63.28 141.33 141.33 141.33h485.49c78.06 0 141.33-63.28 141.33-141.33V301.88c0-31.83-12.64-62.35-35.15-84.85l-117.5-117.5a120.008 120.008 0 0 0-84.85-35.14z", fill: "#53B7F4" },
          { d: "M647.85 360.65c-13.25 0-24 10.75-24 24v226.26l-94.35-93.29c-9.33-9.22-24.34-9.25-33.69-0.05l-95.26 93.6V383.99c0-13.25-10.75-24-24-24s-24 10.75-24 24V668.4c0 9.67 5.8 18.39 14.72 22.13a24.002 24.002 0 0 0 26.1-5.01L512.58 568.4l118.4 117.07a23.993 23.993 0 0 0 16.88 6.93c3.11 0 6.25-0.61 9.24-1.85a24 24 0 0 0 14.75-22.15V384.65c0-13.25-10.74-24-24-24z m213.28-143.62l-117.5-117.5a120.001 120.001 0 0 0-61.75-32.9v131.88c0 41.87 33.94 75.81 75.81 75.81h135.37a119.975 119.975 0 0 0-31.93-57.29z", fill: "#29A3D3" },
          { d: "M647.86 680.4c-6.2 0-12.3-2.4-16.88-6.93L512.58 556.4 393.37 673.52a23.99 23.99 0 0 1-26.1 5.01 23.992 23.992 0 0 1-14.72-22.13V371.99c0-13.25 10.75-24 24-24s24 10.75 24 24v227.19l95.26-93.6c9.36-9.19 24.37-9.17 33.69 0.05l94.35 93.29V372.65c0-13.25 10.75-24 24-24s24 10.75 24 24V656.4c0 9.68-5.82 18.42-14.75 22.15a24.112 24.112 0 0 1-9.24 1.85z", fill: "#FFFFFF" },
        ],
      },
      fileExcel: {
        viewBox: "-21.5 -21 1067 1067",
        parts: [
          { d: "M174.08 42.666667c-11.52 0-23.808 4.693333-32.256 14.08-8.448 9.386667-13.824 21.12-13.824 32.853333v844.8c0 11.733333 4.608 24.234667 13.824 32.853333 9.216 9.386667 20.736 14.08 32.256 14.08h675.84c11.52 0 23.808-4.693333 32.256-14.08 9.216-9.386667 13.824-21.12 13.824-32.853333V308.608L634.88 42.666667H174.08z", fill: "#3DC188" },
          { d: "M896 308.608h-215.04c-11.52 0-23.808-4.693333-32.256-14.08a45.44 45.44 0 0 1-13.824-32.853333V42.666667L896 308.608z", fill: "#B4EBD3" },
          { d: "M476.672 537.045333L372.224 388.394667h72.192l68.352 106.410666 71.424-106.410666h69.888l-106.752 148.650666 112.128 157.994667h-72.96l-75.264-112.64-75.264 113.408H364.544z", fill: "#FFFFFF" },
        ],
      },
      filePpt: {
        viewBox: "2.9 2.9 1018.2 1018.2",
        parts: [
          { d: "M658.56 63.914667H269.269333A141.312 141.312 0 0 0 127.914667 205.226667v612.992a141.312 141.312 0 0 0 141.354666 141.312h485.461334a141.312 141.312 0 0 0 141.354666-141.354667V301.44c0-31.829333-12.629333-62.293333-35.157333-84.821333l-117.504-117.504a120.021333 120.021333 0 0 0-84.864-35.157334z", fill: "#F98950" },
          { d: "M860.928 216.576l-117.504-117.504a119.978667 119.978667 0 0 0-61.738667-32.896v131.84c0 41.898667 33.92 75.861333 75.818667 75.861333h135.338667a119.893333 119.893333 0 0 0-31.914667-57.301333z m-304.896 131.797333H380.373333a24.021333 24.021333 0 0 0-24.021333 23.978667v302.762667a24.021333 24.021333 0 0 0 48 0v-79.530667h151.68a123.733333 123.733333 0 0 0 123.605333-123.605333 123.733333 123.733333 0 0 0-123.605333-123.605334z m0 199.210667H404.352V396.373333h151.68c41.685333 0 75.605333 33.92 75.605333 75.605334s-33.92 75.605333-75.605333 75.605333z", fill: "#F26C38" },
          { d: "M556.032 336.426667H380.373333a24.021333 24.021333 0 0 0-24.021333 23.978666v302.762667a24.021333 24.021333 0 0 0 48 0v-79.530667h151.68a123.733333 123.733333 0 0 0 123.605333-123.605333 123.733333 123.733333 0 0 0-123.605333-123.605333z m0 199.210666H404.352V384.426667h151.68c41.685333 0 75.605333 33.92 75.605333 75.605333s-33.92 75.605333-75.605333 75.605333z", fill: "#FFFFFF" },
        ],
      },
      fileArchive: {
        viewBox: "-21.5 -21 1067 1067",
        parts: [
          { d: "M640 42.666667l256 256v597.333333c0 46.933333-38.4 85.333333-85.333333 85.333333H213.333333c-46.933333 0-85.333333-38.4-85.333333-85.333333V128c0-46.933333 38.4-85.333333 85.333333-85.333333h426.666667z", fill: "#FFB133" },
          { d: "M640 42.666667v170.666666c0 46.933333 38.4 85.333333 85.333333 85.333334h170.666667l-256-256z", fill: "#FFC878" },
          { d: "M554.666667 597.333333v140.8c0 8.533333-4.266667 17.066667-8.533334 21.333334-4.266667 4.266667-12.8 8.533333-21.333333 8.533333h-64c-8.533333 0-17.066667-4.266667-21.333333-8.533333-4.266667-4.266667-8.533333-12.8-8.533334-21.333334V597.333333H554.666667z m-29.866667 85.333334h-64v64h64V682.666667z m29.866667-196.266667v64h-64v-64H554.666667zM490.666667 42.666667v64H554.666667V170.666667h-64v59.733333H554.666667v64h-64v64H554.666667v64h-64v64H426.666667V418.133333h64V354.133333H426.666667V294.4h64V230.4H426.666667V166.4h64V106.666667H426.666667V42.666667h64z", fill: "#FFFFFF" },
        ],
      },
      fileImage: {
        viewBox: "10.6 13.1 997.7 997.7",
        parts: [
          { d: "M897.463 314.514v538.82a97.524 97.524 0 0 1-97.524 97.523H214.796a97.524 97.524 0 0 1-97.524-97.524V170.667a97.524 97.524 0 0 1 97.524-97.524h441.295z", fill: "#85BCFF" },
          { d: "M660.724 216.99V73.143l241.371 241.371H758.248a97.524 97.524 0 0 1-97.524-97.524z", fill: "#529EE0" },
          { d: "M336.701 372.785h341.333q48.762 0 48.762 48.762V700.22q0 48.762-48.762 48.762H336.701q-48.762 0-48.762-48.762V421.547q0-48.762 48.762-48.762z", fill: "#FFFFFF" },
          { d: "M375.954 460.069a29.013 29.013 0 1 0 58.027 0 29.013 29.013 0 1 0-58.027 0zM487.619 641.463l-73.143-56.32-83.383 85.577v28.526a19.992 19.992 0 0 0 20.724 19.017h312.32a20.236 20.236 0 0 0 20.968-19.017V585.143l-73.143-75.825z", fill: "#85BCFF" },
        ],
      },
      fileAudio: {
        viewBox: "-15.8 -6.3 1055.7 1055.7",
        parts: [
          { d: "M663.950222 56.888889H260.323556A146.545778 146.545778 0 0 0 113.777778 203.434667v635.505777a146.545778 146.545778 0 0 0 146.545778 146.545778h503.352888A146.545778 146.545778 0 0 0 910.222222 838.940444V303.217778c0-32.995556-13.084444-64.682667-36.408889-88.007111l-121.856-121.799111C728.632889 69.973333 696.888889 56.888889 663.893333 56.888889z", fill: "#FF9640" },
          { d: "M873.813333 215.153778l-121.856-121.799111a124.416 124.416 0 0 0-64.056889-34.133334v136.760889c0 43.406222 35.214222 78.563556 78.620445 78.563556h140.344889a124.359111 124.359111 0 0 0-33.109334-59.392z", fill: "#F9C499" },
          { d: "M718.563556 489.130667a56.263111 56.263111 0 0 1-8.419556 20.252444c-3.356444 5.12-6.712889 8.533333-10.126222 6.826667-3.356444 0-5.12-22.016-6.712889-25.429334a65.592889 65.592889 0 0 1-5.063111-18.545777c-1.706667-13.539556-6.712889-25.429333-15.189334-30.435556-8.419556-6.826667-20.195556-11.889778-35.384888-15.303111a111.104 111.104 0 0 1-45.568-20.195556c-13.482667-10.183111-28.672-18.602667-37.091556-28.785777-8.476444-8.419556-15.189333-10.183111-18.545778-8.419556-5.063111 1.706667-6.712889 6.769778-6.712889 11.832889v314.424889c0 8.533333-1.706667 18.602667-5.12 28.785778-3.299556 10.183111-5.063111 20.252444-13.482666 30.378666-8.419556 10.24-20.195556 16.952889-35.384889 23.722667s-33.735111 10.183111-54.044445 11.832889a122.311111 122.311111 0 0 1-60.643555-11.832889 121.059556 121.059556 0 0 1-42.154667-32.142222 69.461333 69.461333 0 0 1-15.246222-43.975111c0-15.189333 6.826667-30.378667 21.959111-43.918223a109.795556 109.795556 0 0 1 45.511111-28.785777c16.896-5.12 32.085333-8.419556 47.217778-8.419556 15.246222 0 38.855111 0 50.631111 3.413333 11.776 3.356444 20.252444 5.063111 27.022222 6.712889v-299.235555c0-10.24 3.356444-18.602667 8.419556-25.315556 5.063111-6.826667 13.482667-10.24 21.902222-11.889778 8.476444-1.706667 15.189333 0 20.252444 5.12 5.12 3.356444 0 10.126222 6.712889 16.839112 5.12 6.826667 11.832889 15.303111 20.309334 25.372444 8.419556 10.24 18.488889 18.602667 31.971555 27.079111 11.832889 8.419556 21.959111 13.482667 30.378667 18.602667 8.419556 3.356444 16.896 6.769778 23.665778 10.183111 6.712889 3.356444 15.132444 6.712889 21.902222 11.776 6.712889 5.12 15.189333 11.832889 23.552 22.016 8.476444 10.183111 13.482667 18.545778 15.246222 28.728889 0 10.183111 0 20.252444-1.706667 28.728889z", fill: "#FFFFFF" },
        ],
      },
      fileVideo: {
        viewBox: "3.9 2.9 1018.2 1018.2",
        parts: [
          { d: "M928 310.3v550.3c0 55-44.6 99.6-99.6 99.6H197.6c-55 0-99.6-44.6-99.6-99.6V163.4c0-55 44.6-99.6 99.6-99.6h483.9L928 310.3z", fill: "#C386F0" },
          { d: "M592.1 412.4H330.6c-24.9 0-37.3 12.4-37.3 37.3v205.4c0 24.9 12.4 37.3 37.3 37.3H592c24.9 0 37.3-12.4 37.3-37.3V449.8c0.1-24.9-12.3-37.4-37.2-37.4zM728.9 474.8c-7.8-13.4-24.9-17.9-38.3-10.2l-47.3 27.2V621l47.3 27.3c18.7 10.8 42-2.7 42-24.3V488.8c0.1-4.9-1.2-9.8-3.7-14z", fill: "#FFFFFF" },
          { d: "M681.5 210.7V63.8L928 310.3H781.1c-55 0-99.6-44.5-99.6-99.6", fill: "#A15FDE" },
        ],
      },
      file: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5"],
      up: ["M12 19.6V5", "M4.8 11.6l7.2-6.6 7.2 6.6"],
      home: ["M3.6 10.6l8.4-7 8.4 7", "M6 9.4V20.6h12V9.4"],
      refresh: ["M20.4 12a8.4 8.4 0 1 1-2.6-6.05", "M20.4 3.8v5.6h-5.6"],
      search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M16.2 16.2L21 21"],
      chevron: ["M9 5l7 7-7 7"],
      copy: ["M9 9h9.5A1.5 1.5 0 0 1 20 10.5V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z", "M5 15H4.5A.5.5 0 0 1 4 14.5V4a1 1 0 0 1 1-1h9.5a.5.5 0 0 1 .5.5V5"],
      reveal: ["M4 7.5A1.5 1.5 0 0 1 5.5 6h4l1.8 2.2h7.2A1.5 1.5 0 0 1 20 9.7v7.8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z", "M14 4l3 3-3 3", "M9 7h8"],
      eye: ["M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
      hidden: ["M4 4l16 16", "M9.9 5.1A9.9 9.9 0 0 1 12 4.9c6 0 10.5 7.1 10.5 7.1a17 17 0 0 1-3.4 4.1", "M6.6 6.6A17.4 17.4 0 0 0 1.5 12S6 19.1 12 19.1a10 10 0 0 0 3.5-.6"],
      pencil: ["M4.5 19.5l.9-3.7L16.1 5.1a1.6 1.6 0 0 1 2.3 0l.5.5a1.6 1.6 0 0 1 0 2.3L8.2 18.6l-3.7.9z", "M14.6 6.6l2.8 2.8"],
      scissors: ["M7 4.5l9.5 11.5", "M17 4.5L7.5 16", "M9.4 15.6a2.4 2.4 0 1 1-3.4 3.4 2.4 2.4 0 0 1 3.4-3.4z", "M14.6 15.6a2.4 2.4 0 1 0 3.4 3.4 2.4 2.4 0 0 0-3.4-3.4z"],
      trash: ["M4 7h16", "M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7", "M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7", "M10.5 11v6", "M13.5 11v6"],
      folderPlus: ["M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2.2h8.2A1.5 1.5 0 0 1 20 9.7v7.8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z", "M12 11.5v5", "M9.5 14h5"],
      filePlus: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5", "M12 13v5", "M9.5 15.5h5"],
      paste: ["M9 5.5h6", "M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16"],
      link: ["M10.2 13.8a4 4 0 0 1 0-5.6l1.9-1.9a4 4 0 1 1 5.6 5.6l-1.1 1.1", "M13.8 10.2a4 4 0 0 1 0 5.6l-1.9 1.9a4 4 0 1 1-5.6-5.6l1.1-1.1"],
      text: ["M5 6h14", "M12 6v12", "M9 18h6"],
      external: ["M14 4h6v6", "M20 4l-8 8", "M18.5 14v5.5A1.5 1.5 0 0 1 17 21H5.5A1.5 1.5 0 0 1 4 19.5V8a1.5 1.5 0 0 1 1.5-1.5H11"],
      squares: ["M4 5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5v6A1.5 1.5 0 0 1 11.5 13h-6A1.5 1.5 0 0 1 4 11.5z", "M11 15.5A1.5 1.5 0 0 1 12.5 14h6a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5z"],
      viewList: ["M4 7h.01", "M8 7h12", "M4 12h.01", "M8 12h12", "M4 17h.01", "M8 17h12"],
      viewGrid: ["M4 4.5h6v6H4z", "M14 4.5h6v6h-6z", "M4 13.5h6v6H4z", "M14 13.5h6v6h-6z"],
      info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5.5", "M12 7.6h.01"],
      chevronDown: ["M6 9.5l6 6 6-6"],
      plus: ["M12 5v14", "M5 12h14"],
      check: ["M5 12.5l4.5 4.5L19 7"],
      undo: ["M4 9h9.5a5 5 0 0 1 0 10H8", "M7.5 5.5L4 9l3.5 3.5"],
      sortIcon: ["M4 7h9", "M4 12h6", "M4 17h3", "M18 5.5v13", "M15 15.5l3 3 3-3"],
      moreIcon: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
      pane: ["M3.5 5.5h17v13h-17z", "M15 5.5v13"],
    };

    /**
     * Render a named icon.
     * @param {string} name - shape name
     * @param {number} size - square edge
     * @returns {object} svg element
     */
    function glyph(name, size) {
      return icon(SHAPES[name] || SHAPES.file, size);
    }

    /**
     * The icon shape an entry should use.
     * @param {object} entry - listing row
     * @returns {string} shape name
     */
    function entryShape(entry) {
      if (!entry) return "file";
      if (entry.dir) return "folderFilled";
      var byKind = {
        text: "fileText",
        image: "fileImage",
        pdf: "filePdf",
        word: "fileWord",
        excel: "fileExcel",
        ppt: "filePpt",
        archive: "fileArchive",
        audio: "fileAudio",
        video: "fileVideo",
      };
      return byKind[entry.kind] || "fileOther";
    }

    /**
     * Human label for an entry's kind, shown in the list view.
     * @param {object} entry - listing row
     * @returns {string} label
     */
    function kindLabel(entry) {
      if (!entry) return "";
      if (entry.dir) return "文件夹";
      var byKind = {
        text: "文本文件",
        image: "图片",
        pdf: "PDF 文档",
        word: "Word 文档",
        excel: "Excel 表格",
        ppt: "PPT 演示",
        archive: "压缩包",
        audio: "音频",
        video: "视频",
        binary: "二进制文件",
      };
      return byKind[entry.kind] || "文件";
    }

    /**
     * Human-readable byte size.
     * @param {number} bytes - raw size
     * @returns {string} formatted size
     */
    function formatSize(bytes) {
      if (typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) return "";
      if (bytes === 0) return "0 B";
      if (bytes < 1024) return bytes + " B";
      var units = ["KB", "MB", "GB", "TB"];
      var value = bytes / 1024;
      var unit = 0;
      while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
      return (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + " " + units[unit];
    }

    /**
     * Compact local timestamp.
     * @param {number} ms - epoch milliseconds
     * @returns {string} formatted date
     */
    function formatDate(ms) {
      if (!ms) return "";
      var date = new Date(ms);
      if (isNaN(date.getTime())) return "";
      var pad = function (value) { return String(value).padStart(2, "0"); };
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }

    /**
     * Compare two entry names in the user's locale.
     * @param {string} a - left name
     * @param {string} b - right name
     * @returns {number} sort order
     */
    function compareNames(a, b) {
      try {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      } catch (error) {
        return a < b ? -1 : a > b ? 1 : 0;
      }
    }

    /**
     * Parent directory of a POSIX or Windows path.
     * @param {string} target - absolute path
     * @returns {string} parent path
     */
    function parentOf(target) {
      if (!target) return "";
      var cut = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
      return cut > 0 ? target.slice(0, cut) : target;
    }

    /**
     * Split an absolute path into breadcrumb segments from the root.
     * @param {object} listing - current listing
     * @returns {Array} crumbs
     */
    function crumbsOf(listing) {
      if (!listing) return [];
      var rootPath = listing.root || "";
      var current = listing.path || "";
      if (!rootPath || current.indexOf(rootPath) !== 0) {
        return [{ label: current.split(/[\\/]/).pop() || current, path: current }];
      }
      var suffix = current.slice(rootPath.length).split(/[\\/]/).filter(Boolean);
      var out = [{ label: rootPath.split(/[\\/]/).pop() || rootPath, path: rootPath }];
      var walked = rootPath;
      suffix.forEach(function (part) {
        walked = walked + "/" + part;
        out.push({ label: part, path: walked });
      });
      return out;
    }

    /**
     * GET a host route and decode JSON.
     * @param {string} route - route suffix
     * @param {object} params - query parameters
     * @returns {Promise<object>} { ok, body }
     */
    function apiGet(route, params) {
      var search = new URLSearchParams(params || {}).toString();
      return fetch(API + route + (search ? "?" + search : ""), { headers: { accept: "application/json" } })
        .then(function (response) {
          return response.json().then(function (body) { return { ok: response.ok, body: body }; }, function () {
            return { ok: false, body: { message: "响应无法解析" } };
          });
        });
    }

    /**
     * POST a host route, with an optional JSON body.
     * @param {string} route - route suffix
     * @param {object} params - query parameters
     * @param {object} body - JSON body
     * @returns {Promise<object>} { ok, body }
     */
    function apiPost(route, params, body) {
      var search = new URLSearchParams(params || {}).toString();
      return fetch(API + route + (search ? "?" + search : ""), {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }).then(function (response) {
        return response.json().then(function (payload) { return { ok: response.ok, body: payload }; }, function () {
          return { ok: false, body: { message: "响应无法解析" } };
        });
      });
    }

    /**
     * Sidebar entry icon: the folder glyph at the size the sidebar asks for.
     * @param {object} props - sidebar icon share
     * @returns {object} svg element
     */
    function PanelIcon(props) {
      return glyph("folder", props && typeof props.size === "number" ? props.size : 18);
    }

    /**
     * Single-line input dialog used for rename / new folder / new file.
     * @param {object} props - title, label, value, confirmLabel, busy, onCancel, onSubmit
     * @returns {object} dialog element
     */
    function PromptDialog(props) {
      var [value, setValue] = useState(props.value || "");
      var inputRef = useRef(null);

      useEffect(function () {
        var node = inputRef.current;
        if (!node) return;
        node.focus();
        var dot = value.lastIndexOf(".");
        if (dot > 0) node.setSelectionRange(0, dot);
        else node.select();
      }, []);

      var submit = function () {
        var text = String(value).trim();
        if (!text || props.busy) return;
        props.onSubmit(text);
      };

      return h("div", {
        className: "dfx-overlay",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onCancel(); },
      },
        h("div", { className: "dfx-dialog", role: "dialog", "aria-modal": "true", "aria-label": props.title },
          h("div", { className: "dfx-dialog-title" }, props.title),
          props.label ? h("div", { className: "dfx-dialog-label" }, props.label) : null,
          h("input", {
            ref: inputRef,
            className: "dfx-dialog-input",
            value: value,
            spellCheck: false,
            autoComplete: "off",
            onChange: function (event) { setValue(event.target.value); },
            onKeyDown: function (event) {
              if (event.key === "Enter") { event.preventDefault(); submit(); }
              else if (event.key === "Escape") { event.preventDefault(); props.onCancel(); }
            },
          }),
          h("div", { className: "dfx-dialog-actions" },
            h("button", { type: "button", className: "dfx-btn", onClick: props.onCancel }, "取消"),
            h("button", {
              type: "button",
              className: "dfx-btn dfx-btn--primary",
              disabled: props.busy || String(value).trim().length === 0,
              onClick: submit,
            }, props.confirmLabel || "确定"))));
    }

    /**
     * About dialog: what the plugin is, which version, who made it.
     * @param {object} props - meta, onClose
     * @returns {object} dialog element
     */
    function AboutDialog(props) {
      var meta = props.meta || {};
      var author = meta.author && typeof meta.author === "object" ? meta.author : null;
      var repoUrl = String((meta.repository && meta.repository.url) || "git+https://github.com/MaxBill/dsh-file-explorer.git").replace(/^git\+/, "").replace(/\.git$/, "");
      var homeUrl = (author && author.url) || meta.homepage || "https://github.com/MaxBill";
      var rows = [
        ["版本", meta.version ? "v" + meta.version : "读取中…"],
        ["包名", meta.name || "dsh-file-explorer"],
        ["开发者", author ? author.name : "MaxBill"],
        ["开发者首页", homeUrl],
        ["仓库", repoUrl],
        ["许可", meta.license || "MIT"],
        ["根目录", meta.root || "—"],
      ];
      return h("div", {
        className: "dfx-overlay",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); },
      },
        h("div", { className: "dfx-dialog dfx-about", role: "dialog", "aria-modal": "true", "aria-label": "关于 文件管理器" },
          h("div", { className: "dfx-dialog-title" }, "关于 文件管理器"),
          h("div", { className: "dfx-about-blurb" }, "DeepSeek Harness 左侧栏里的文件管理器：浏览、预览、详情、批量选择，以及重命名 / 复制 / 移动 / 删除这些常用操作。"),
          h("div", { className: "dfx-about-rows" }, rows.map(function (row) {
            return h("div", { key: row[0], className: "dfx-about-row" },
              h("span", { className: "dfx-about-label" }, row[0]),
              h("span", { className: "dfx-about-value" }, row[1]));
          })),
          h("div", { className: "dfx-about-note" }, "所有操作都限制在主目录之内，删除只会移入废纸篓。"),
          h("div", { className: "dfx-dialog-actions" },
            h("button", { type: "button", className: "dfx-btn dfx-btn--primary", onClick: props.onClose }, "关闭"))));
    }

    /**
     * Confirmation dialog for destructive actions.
     * @param {object} props - title, message, confirmLabel, danger, busy, onCancel, onConfirm
     * @returns {object} dialog element
     */
    function ConfirmDialog(props) {
      return h("div", {
        className: "dfx-overlay",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onCancel(); },
      },
        h("div", { className: "dfx-dialog", role: "dialog", "aria-modal": "true", "aria-label": props.title },
          h("div", { className: "dfx-dialog-title" }, props.title),
          h("div", { className: "dfx-dialog-message" }, props.message),
          h("div", { className: "dfx-dialog-actions" },
            h("button", { type: "button", className: "dfx-btn", onClick: props.onCancel }, "取消"),
            h("button", {
              type: "button",
              className: "dfx-btn " + (props.danger ? "dfx-btn--danger" : "dfx-btn--primary"),
              disabled: props.busy,
              onClick: props.onConfirm,
            }, props.confirmLabel || "确定"))));
    }

    /** macOS shows ⌘ accelerators, every other platform shows Ctrl. */
    var IS_MAC = (function () {
      try { return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || ""); } catch (error) { return true; }
    })();

    /**
     * Platform accelerator label.
     * @param {string} key - key name
     * @returns {string} hint text
     */
    function accel(key) {
      return IS_MAC ? "⌘" + key : "Ctrl+" + key;
    }

    /**
     * The 文件管理器 panel: browse the home tree, filter, preview, and run the
     * context-menu file operations.
     * @returns {object} panel element
     */
    function FileExplorerPanel() {
      var [listing, setListing] = useState(null);
      var [status, setStatus] = useState("loading");
      var [error, setError] = useState(null);
      var [query, setQuery] = useState("");
      var [showHidden, setShowHidden] = useState(false);
      var [sort, setSort] = useState("name");
      var [view, setView] = useState(function () { return remembered.view || readStoredView() || VIEW_MODES[0]; });
      var [selected, setSelected] = useState(null);
      var [selectedPaths, setSelectedPaths] = useState([]);
      var [anchorPath, setAnchorPath] = useState(null);
      var [undoStack, setUndoStack] = useState([]);
      var [popup, setPopup] = useState(null);
      var [paneVisible, setPaneVisible] = useState(true);
      var [addressDraft, setAddressDraft] = useState(null);
      var addressRef = useRef(null);
      var rootRef = useRef(null);
      var [preview, setPreview] = useState(null);
      var [previewStatus, setPreviewStatus] = useState("idle");
      var [paneMode, setPaneMode] = useState("preview");
      var [details, setDetails] = useState(null);
      var [detailsStatus, setDetailsStatus] = useState("idle");
      var [notice, setNotice] = useState(null);
      var [menu, setMenu] = useState(null);
      var [dialog, setDialog] = useState(null);
      var [about, setAbout] = useState(null);
      var [clipboard, setClipboard] = useState(remembered.clipboard);
      var [busy, setBusy] = useState(false);
      var requestSeq = useRef(0);
      var rowsRef = useRef(null);
      var searchRef = useRef(null);
      var previewRef = useRef(null);
      var detailsRef = useRef(null);
      var listingRef = useRef(null);

      listingRef.current = listing;

      var notify = useCallback(function (text, tone) {
        setNotice({ text: text, tone: tone || "info" });
      }, []);

      var changeView = useCallback(function (next) {
        if (VIEW_MODES.indexOf(next) === -1) return;
        remembered.view = next;
        storeView(next);
        setView(next);
      }, []);

      var load = useCallback(function (target, focusPath) {
        var seq = requestSeq.current + 1;
        requestSeq.current = seq;
        setStatus("loading");
        setError(null);
        setMenu(null);
        apiGet("/list", target ? { path: target } : {}).then(function (result) {
          if (requestSeq.current !== seq) return;
          if (!result.ok) throw new Error((result.body && result.body.message) || "无法读取目录");
          setListing(result.body);
          remembered.path = result.body.path;
          setStatus("ready");
          var focus = focusPath
            ? result.body.entries.filter(function (entry) { return entry.path === focusPath; })[0] || null
            : null;
          setDetails(null);
          setDetailsStatus("idle");
          setSelected(focus);
          setSelectedPaths(focus ? [focus.path] : []);
          setAnchorPath(focus ? focus.path : null);
          if (focus && focus.dir) detailsRef.current(focus);
          else if (focus) previewRef.current(focus);
          else { setPreview(null); setPreviewStatus("idle"); }
        }).catch(function (failure) {
          if (requestSeq.current !== seq) return;
          setError(String((failure && failure.message) || failure));
          setStatus("error");
        });
      }, []);

      useEffect(function () { load(remembered.path); }, [load]);

      useEffect(function () {
        if (!notice) return undefined;
        var timer = setTimeout(function () { setNotice(null); }, 2400);
        return function () { clearTimeout(timer); };
      }, [notice]);

      // Dismiss the context menu on any click, scroll, resize or Escape outside it.
      useEffect(function () {
        if (!menu) return undefined;
        // A press inside the menu belongs to the menu; anything else dismisses it.
        var close = function (event) {
          var target = event && event.target;
          if (target && target.closest && target.closest(".dfx-menu")) return;
          setMenu(null);
        };
        var onKey = function (event) { if (event.key === "Escape") setMenu(null); };
        window.addEventListener("mousedown", close);
        window.addEventListener("keydown", onKey);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        return function () {
          window.removeEventListener("mousedown", close);
          window.removeEventListener("keydown", onKey);
          window.removeEventListener("scroll", close, true);
          window.removeEventListener("resize", close);
        };
      }, [menu]);

      var openPreview = useCallback(function (entry) {
        if (!entry || entry.dir) {
          setPreview(null);
          setPreviewStatus("idle");
          return;
        }
        setPreviewStatus("loading");
        setPreview(null);
        apiGet("/read", { path: entry.path }).then(function (result) {
          if (!result.ok) throw new Error((result.body && result.body.message) || "无法读取文件");
          setPreview({ entry: entry, body: result.body });
          setPreviewStatus("ready");
        }).catch(function (failure) {
          setPreview({ entry: entry, error: String((failure && failure.message) || failure) });
          setPreviewStatus("error");
        });
      }, []);
      previewRef.current = openPreview;

      var openDetails = useCallback(function (entry) {
        if (!entry) { setDetails(null); setDetailsStatus("idle"); return; }
        setDetailsStatus("loading");
        setDetails(null);
        apiGet("/stat", { path: entry.path }).then(function (result) {
          if (!result.ok) throw new Error((result.body && result.body.message) || "无法读取详情");
          setDetails({ entry: entry, body: result.body });
          setDetailsStatus("ready");
        }).catch(function (failure) {
          setDetails({ entry: entry, error: String((failure && failure.message) || failure) });
          setDetailsStatus("error");
        });
      }, []);
      detailsRef.current = openDetails;

      /** Open the details pane for one entry and remember the choice. */
      var openInfo = useCallback(function (entry) {
        if (!entry) return;
        setPaneVisible(true);
        setPaneMode("info");
        openDetails(entry);
      }, [openDetails]);

      /** Fill the right pane for an entry according to the current mode. */
      var fillPane = useCallback(function (entry) {
        if (!entry) {
          setPreview(null);
          setPreviewStatus("idle");
          setDetails(null);
          setDetailsStatus("idle");
          return;
        }
        if (entry.dir || paneMode === "info") openDetails(entry);
        else openPreview(entry);
      }, [paneMode, openDetails, openPreview]);

      /** Select one entry, replacing the selection. */
      var selectEntry = useCallback(function (entry) {
        setSelected(entry);
        setSelectedPaths(entry ? [entry.path] : []);
        setAnchorPath(entry ? entry.path : null);
        fillPane(entry);
      }, [fillPane]);

      /** The entries the bulk actions apply to. */
      function selectionEntries() {
        var paths = selectedPaths.length > 0 ? selectedPaths : (selected ? [selected.path] : []);
        return rows.filter(function (row) { return paths.indexOf(row.path) !== -1; });
      }

      /** Select every visible row. */
      function selectAllRows() {
        var paths = rows.map(function (row) { return row.path; });
        setSelectedPaths(paths);
        setPopup(null);
        if (!selected && rows.length > 0) {
          setSelected(rows[0]);
          fillPane(rows[0]);
        }
      }

      /** Drop the whole selection. */
      function clearSelection() {
        setSelectedPaths([]);
        setAnchorPath(null);
        setSelected(null);
        setPreview(null);
        setPreviewStatus("idle");
        setDetails(null);
        setDetailsStatus("idle");
        setPopup(null);
      }

      /** Select the rows that are not selected yet. */
      function invertSelection() {
        var next = rows.filter(function (row) { return selectedPaths.indexOf(row.path) === -1; });
        setPopup(null);
        if (next.length === 0) { clearSelection(); return; }
        setSelectedPaths(next.map(function (row) { return row.path; }));
        setSelected(next[0]);
        fillPane(next[0]);
      }

      /** Apply a row click, honouring Cmd/Ctrl (toggle) and Shift (range). */
      function applyClick(entry, event) {
        if (!entry) return;
        var meta = !!(event && (event.metaKey || event.ctrlKey));
        var shift = !!(event && event.shiftKey);
        if (shift && anchorPath) {
          var order = rows.map(function (row) { return row.path; });
          var from = order.indexOf(anchorPath);
          var to = order.indexOf(entry.path);
          if (from !== -1 && to !== -1) {
            var slice = from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1);
            setSelectedPaths(slice);
            setSelected(entry);
            fillPane(entry);
            return;
          }
        }
        if (meta) {
          setSelected(entry);
          setAnchorPath(entry.path);
          setSelectedPaths(function (current) {
            return current.indexOf(entry.path) === -1
              ? current.concat([entry.path])
              : current.filter(function (path) { return path !== entry.path; });
          });
          fillPane(entry);
          return;
        }
        selectEntry(entry);
      }

      var openEntry = useCallback(function (entry) {
        if (!entry) return;
        if (entry.dir) { load(entry.path); return; }
        setPaneMode("preview");
        openPreview(entry);
      }, [load, openPreview]);

      var mutate = useCallback(function (options) {
        setBusy(true);
        setMenu(null);
        apiPost(options.route, options.params || {}, options.body).then(function (result) {
          setBusy(false);
          if (!result.ok) {
            notify((result.body && result.body.message) || "操作失败", "error");
            return;
          }
          var current = listingRef.current;
          var produced = result.body && typeof result.body.path === "string" ? result.body.path : null;
          var focus = produced && current && parentOf(produced) === current.path ? produced : null;
          if (options.onDone) options.onDone(result.body);
          notify(options.success, "info");
          load(current ? current.path : null, focus);
        }, function (failure) {
          setBusy(false);
          notify(String((failure && failure.message) || failure), "error");
        });
      }, [load, notify]);

      var copyText = useCallback(function (text, success) {
        var write = navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(text)
          : Promise.reject(new Error("剪贴板不可用"));
        write.then(function () { notify(success, "info"); }, function () { notify("复制失败", "error"); });
      }, [notify]);

      /** Put the whole selection on the panel clipboard. */
      function clipboardFromSelection(mode) {
        var entries = selectionEntries();
        if (entries.length === 0) { notify("先选择文件或文件夹", "error"); return; }
        var next = { paths: entries.map(function (entry) { return entry.path; }), mode: mode };
        remembered.clipboard = next;
        setClipboard(next);
        notify((mode === "cut" ? "已剪切 " : "已拷贝 ") + entries.length + " 项", "info");
      }

      /** POST that rejects unless the host answers ok. */
      function postOk(route, params, body) {
        return apiPost(route, params, body).then(function (result) {
          if (!result.ok) throw new Error((result.body && result.body.message) || "请求失败");
          return result.body;
        });
      }

      /** Remember one reversible step so 撤销 can replay it. */
      function pushUndo(step) {
        setUndoStack(function (current) { return [step].concat(current).slice(0, 20); });
      }

      /** Undo the most recent reversible step. */
      function runUndo() {
        var step = undoStack[0];
        setPopup(null);
        if (!step) return;
        setUndoStack(function (current) { return current.slice(1); });
        setBusy(true);
        Promise.resolve().then(step.run).then(function () {
          setBusy(false);
          notify("已撤销：" + step.label, "info");
          var current = listingRef.current;
          load(current ? current.path : null);
        }, function (failure) {
          setBusy(false);
          notify("撤销失败：" + String((failure && failure.message) || failure), "error");
        });
      }

      /** Ask, then move the selection to the Trash. */
      function askDeleteSelection() {
        var entries = selectionEntries();
        if (entries.length === 0) { notify("先选择文件或文件夹", "error"); return; }
        setDialog({
          kind: "confirm", title: "移到废纸篓", danger: true, confirmLabel: "移到废纸篓",
          message: entries.length === 1
            ? "“" + entries[0].name + "”将被移到废纸篓，可以从废纸篓找回。"
            : "选中的 " + entries.length + " 项将被移到废纸篓，可以从废纸篓找回。",
          onConfirm: function () { moveSelectionToTrash(entries); },
        });
      }

      /** Move several entries to the Trash and remember how to restore them. */
      function moveSelectionToTrash(entries) {
        setBusy(true);
        var moved = [];
        var chain = Promise.resolve();
        entries.forEach(function (entry) {
          chain = chain.then(function () {
            return postOk("/trash", { path: entry.path }).then(function (body) {
              moved.push({ from: body.from || entry.path, to: body.path });
            });
          });
        });
        chain.then(function () {
          setBusy(false);
          if (moved.length > 0) {
            pushUndo({
              label: "删除 " + moved.length + " 项",
              run: function () {
                return Promise.all(moved.map(function (item) {
                  return postOk("/transfer", {}, { sources: [item.to], target: parentOf(item.from), mode: "move" });
                }));
              },
            });
            notify("已移到废纸篓", "info");
          }
          var current = listingRef.current;
          load(current ? current.path : null);
        }, function (failure) {
          setBusy(false);
          notify(String((failure && failure.message) || failure), "error");
        });
      }

      var revealPath = useCallback(function (target) {
        apiPost("/reveal", { path: target }).then(function (result) {
          if (!result.ok) { notify((result.body && result.body.message) || "无法显示", "error"); return; }
          if (result.body && result.body.ok) notify("已在访达中显示", "info");
          else notify("此平台不支持显示", "error");
        }, function () { notify("无法在访达中显示", "error"); });
      }, [notify]);

      var openWithApp = useCallback(function (target) {
        apiPost("/open", { path: target }).then(function (result) {
          if (!result.ok) notify((result.body && result.body.message) || "无法打开", "error");
        }, function () { notify("无法打开", "error"); });
      }, [notify]);

      var paste = useCallback(function () {
        var clip = remembered.clipboard;
        var current = listingRef.current;
        if (!clip || !clip.paths || clip.paths.length === 0 || !current) {
          notify("剪贴板是空的", "error");
          return;
        }
        var mode = clip.mode === "cut" ? "move" : "copy";
        mutate({
          route: "/transfer",
          body: { sources: clip.paths, target: current.path, mode: mode },
          success: mode === "move" ? "已移动" : "已拷贝到当前文件夹",
          onDone: mode === "move" ? function (body) {
            var results = (body && body.results) || [];
            if (results.length === 0) return;
            pushUndo({
              label: "移动 " + results.length + " 项",
              run: function () {
                return Promise.all(results.map(function (item) {
                  return postOk("/transfer", {}, {
                    sources: [item.path],
                    target: parentOf(item.from && item.from !== item.path ? item.from : item.path),
                    mode: "move",
                  });
                }));
              },
            });
          } : null,
        });
        if (mode === "move") {
          remembered.clipboard = null;
          setClipboard(null);
        }
      }, [mutate, notify]);

      /** Ask for a name, then create a folder in the current directory. */
      function askNewFolder() {
        var current = listingRef.current;
        if (!current) return;
        setDialog({
          kind: "prompt", title: "新建文件夹", label: "文件夹名称", value: "未命名文件夹", confirmLabel: "创建",
          onSubmit: function (name) {
            mutate({
              route: "/mkdir", params: { path: current.path, name: name }, success: "已新建文件夹",
              onDone: function (body) {
                pushUndo({ label: "新建文件夹", run: function () { return postOk("/trash", { path: body.path }); } });
              },
            });
          },
        });
      }

      /** Ask for a name, then create an empty file in the current directory. */
      function askNewFile() {
        var current = listingRef.current;
        if (!current) return;
        setDialog({
          kind: "prompt", title: "新建文件", label: "文件名称", value: "未命名.txt", confirmLabel: "创建",
          onSubmit: function (name) {
            mutate({
              route: "/newfile", params: { path: current.path, name: name }, success: "已新建文件",
              onDone: function (body) {
                pushUndo({ label: "新建文件", run: function () { return postOk("/trash", { path: body.path }); } });
              },
            });
          },
        });
      }

      /** Open the rename dialog for one entry. */
      function askRename(entry) {
        setDialog({
          kind: "prompt", title: "重新命名", label: "新名称", value: entry.name, confirmLabel: "重新命名",
          onSubmit: function (name) {
            var original = entry.name;
            mutate({
              route: "/rename", params: { path: entry.path, name: name }, success: "已重新命名",
              onDone: function (body) {
                pushUndo({
                  label: "重命名 " + original,
                  run: function () { return postOk("/rename", { path: body.path, name: original }); },
                });
              },
            });
          },
        });
      }

      /** Ask before moving one entry to the Trash. */
      function askTrash(entry) {
        setDialog({
          kind: "confirm", title: "移到废纸篓", danger: true, confirmLabel: "移到废纸篓",
          message: "“" + entry.name + "”将被移到废纸篓，可以从废纸篓找回。",
          onConfirm: function () { moveSelectionToTrash([entry]); },
        });
      }

      /** Run one context-menu command. */
      function menuAction(id) {
        var entry = menu && menu.entry;
        var current = listingRef.current;
        setMenu(null);
        if (!id) return;
        if (id === "refresh") { load(current ? current.path : null); return; }
        if (id === "revealHere") { if (current) revealPath(current.path); return; }
        if (id === "paste") { paste(); return; }
        if (id === "mkdir") { askNewFolder(); return; }
        if (id === "newfile") { askNewFile(); return; }
        if (!entry) return;
        if (id === "open") { openEntry(entry); return; }
        if (id === "info") { setSelected(entry); openInfo(entry); return; }
        if (id === "openApp") { openWithApp(entry.path); return; }
        if (id === "reveal") { revealPath(entry.path); return; }
        if (id === "copy") { clipboardFromSelection("copy"); return; }
        if (id === "cut") { clipboardFromSelection("cut"); return; }
        if (id === "copyPath") { copyText(entry.path, "已复制路径"); return; }
        if (id === "copyName") { copyText(entry.name, "已复制名称"); return; }
        if (id === "duplicate") {
          mutate({
            route: "/duplicate", params: { path: entry.path }, success: "已复制副本",
            onDone: function (body) {
              pushUndo({ label: "复制副本", run: function () { return postOk("/trash", { path: body.path }); } });
            },
          });
          return;
        }
        if (id === "rename") { askRename(entry); return; }
        if (id === "trash") { askDeleteSelection(); return; }
      }

      /** Open the About dialog and fetch the manifest once. */
      function openAbout() {
        setDialog({ kind: "about" });
        if (about) return;
        apiGet("/meta").then(function (result) {
          if (result.ok) setAbout(result.body);
        }).catch(function () { /* the dialog still shows its fallbacks */ });
      }

      /** Open one of the toolbar popups under its button. */
      function openPopup(kind, event) {
        var rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
        setPopup({
          kind: kind,
          x: rect ? rect.left : 40,
          y: rect ? rect.bottom + 6 : 90,
        });
      }

      /** Run one toolbar command. */
      function toolAction(id) {
        if (id === "cut") { clipboardFromSelection("cut"); return; }
        if (id === "copy") { clipboardFromSelection("copy"); return; }
        if (id === "paste") { paste(); return; }
        if (id === "rename") {
          var entries = selectionEntries();
          if (entries.length !== 1) { notify("重命名只针对单个条目", "error"); return; }
          askRename(entries[0]);
          return;
        }
        if (id === "trash") { askDeleteSelection(); return; }
      }

      /** Run one popup command. */
      function popupAction(id) {
        var origin = popup;
        setPopup(null);
        if (id === "new:folder") { askNewFolder(); return; }
        if (id === "new:file") { askNewFile(); return; }
        if (id.indexOf("sort:") === 0) { setSort(id.slice(5)); return; }
        if (id === "opt:hidden") { setShowHidden(!showHidden); return; }
        if (id === "opt:list") { changeView("list"); return; }
        if (id === "opt:icons") { changeView("icons"); return; }
        if (id === "opt:preview") {
          setPaneMode("preview");
          if (selected && !selected.dir) openPreview(selected);
          return;
        }
        if (id === "opt:info") {
          setPaneMode("info");
          if (selected) openDetails(selected);
          return;
        }
        if (id === "undo") { runUndo(); return; }
        if (id === "all") { selectAllRows(); return; }
        if (id === "none") { clearSelection(); return; }
        if (id === "invert") { invertSelection(); return; }
        if (id === "options" && origin) { setPopup({ kind: "options", x: origin.x, y: origin.y }); return; }
        if (id === "about") { openAbout(); return; }
      }

      /** Turn the breadcrumb bar into an editable path field. */
      function startAddressEdit() {
        if (!listing) return;
        setAddressDraft(listing.path);
      }

      /** Resolve a typed path against the current folder, the home root and "~". */
      function resolveAddress(text, base, root) {
        var raw = String(text || "").trim();
        if (!raw) return null;
        if (raw === "~") raw = root || "/";
        else if (raw.indexOf("~/") === 0) raw = (root || "") + raw.slice(1);
        if (raw.charAt(0) !== "/") raw = (base || root || "/") + "/" + raw;
        var parts = raw.split("/");
        var out = [];
        parts.forEach(function (part) {
          if (!part || part === ".") return;
          if (part === "..") { out.pop(); return; }
          out.push(part);
        });
        return "/" + out.join("/");
      }

      /** Leave edit mode and jump to the typed path. */
      function commitAddress(text) {
        var base = listing ? listing.path : null;
        var root = listing ? listing.root : null;
        setAddressDraft(null);
        var next = resolveAddress(text, base, root);
        if (next) load(next);
      }

      // ⌘L focuses the address bar, the way a browser does.
      useEffect(function () {
        if (typeof window === "undefined" || !window.addEventListener) return undefined;
        var onKey = function (event) {
          if (!(event.metaKey || event.ctrlKey) || (event.key !== "l" && event.key !== "L")) return;
          var node = rootRef.current;
          if (!node || !node.contains || !node.contains(document.activeElement)) return;
          event.preventDefault();
          startAddressEdit();
        };
        window.addEventListener("keydown", onKey);
        return function () { window.removeEventListener("keydown", onKey); };
      }, [listing]);

      useEffect(function () {
        if (addressDraft === null) return;
        var node = addressRef.current;
        if (node && node.focus) {
          node.focus();
          if (node.select) node.select();
        }
      }, [addressDraft]);

      var rows = useMemo(function () {
        if (!listing) return [];
        var needle = query.trim().toLowerCase();
        var filtered = listing.entries.filter(function (entry) {
          if (!showHidden && entry.hidden) return false;
          if (!needle) return true;
          return entry.name.toLowerCase().indexOf(needle) !== -1;
        });
        var sorted = filtered.slice();
        sorted.sort(function (left, right) {
          if (left.dir !== right.dir) return left.dir ? -1 : 1;
          if (sort === "mtime") return (right.mtime || 0) - (left.mtime || 0) || compareNames(left.name, right.name);
          if (sort === "size") return (right.size || 0) - (left.size || 0) || compareNames(left.name, right.name);
          return compareNames(left.name, right.name);
        });
        return sorted;
      }, [listing, query, showHidden, sort]);

      var crumbs = useMemo(function () { return crumbsOf(listing); }, [listing]);

      useEffect(function () {
        if (!popup) return undefined;
        var close = function (event) {
          var target = event && event.target;
          if (target && target.closest && target.closest(".dfx-menu")) return;
          setPopup(null);
        };
        var onKey = function (event) { if (event.key === "Escape") setPopup(null); };
        window.addEventListener("mousedown", close);
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", close);
        return function () {
          window.removeEventListener("mousedown", close);
          window.removeEventListener("keydown", onKey);
          window.removeEventListener("resize", close);
        };
      }, [popup]);

      var popupItems = useMemo(function () {
        if (!popup) return [];
        if (popup.kind === "new") {
          return [
            { id: "new:folder", label: "新建文件夹…", icon: "folder" },
            { id: "new:file", label: "新建文件…", icon: "file" },
          ];
        }
        if (popup.kind === "sort") {
          return [
            { id: "sort:name", label: "名称", checked: sort === "name" },
            { id: "sort:size", label: "大小", checked: sort === "size" },
            { id: "sort:mtime", label: "修改时间", checked: sort === "mtime" },
          ];
        }
        if (popup.kind === "options") {
          return [
            { id: "opt:hidden", label: "显示隐藏文件", checked: showHidden },
            { separator: true },
            { id: "opt:list", label: "列表视图", checked: view === "list" },
            { id: "opt:icons", label: "图标视图", checked: view === "icons" },
            { separator: true },
            { id: "opt:preview", label: "右侧显示预览", checked: paneMode === "preview" },
            { id: "opt:info", label: "右侧显示详情", checked: paneMode === "info" },
          ];
        }
        return [
          { id: "undo", label: undoStack.length > 0 ? "撤销 " + undoStack[0].label : "撤销", icon: "undo", disabled: undoStack.length === 0 },
          { separator: true },
          { id: "all", label: "全部选择", hint: accel("A") },
          { id: "none", label: "全部取消", hint: IS_MAC ? "⌘⇧A" : "Ctrl+Shift+A" },
          { id: "invert", label: "反向选择", hint: IS_MAC ? "⌘⌥A" : "Ctrl+Alt+A" },
          { separator: true },
          { id: "options", label: "选项…" },
          { id: "about", label: "关于 文件管理器…" },
        ];
      }, [popup, sort, showHidden, view, paneMode, undoStack]);

      var menuItems = useMemo(function () {
        if (!menu) return [];
        var entry = menu.entry;
        if (entry) {
          return [
            { id: "open", label: entry.dir ? "打开" : "预览", icon: entry.dir ? "folder" : "file" },
            { id: "info", label: "显示详情", icon: "info" },
            { id: "openApp", label: "用默认应用打开", icon: "external" },
            { id: "reveal", label: "在访达中显示", icon: "reveal" },
            { separator: true },
            { id: "rename", label: "重新命名…", icon: "pencil" },
            { id: "duplicate", label: "复制副本", icon: "squares" },
            { id: "copy", label: "拷贝", icon: "copy", hint: accel("C") },
            { id: "cut", label: "剪切", icon: "scissors", hint: accel("X") },
            { separator: true },
            { id: "copyPath", label: "复制路径", icon: "link" },
            { id: "copyName", label: "复制名称", icon: "text" },
            { separator: true },
            { id: "trash", label: "移到废纸篓", icon: "trash", danger: true },
          ];
        }
        return [
          { id: "mkdir", label: "新建文件夹…", icon: "folderPlus" },
          { id: "newfile", label: "新建文件…", icon: "filePlus" },
          { id: "paste", label: "粘贴", icon: "paste", hint: accel("V"), disabled: !clipboard },
          { separator: true },
          { id: "revealHere", label: "在访达中显示当前文件夹", icon: "reveal" },
          { id: "refresh", label: "刷新", icon: "refresh" },
        ];
      }, [menu, clipboard]);

      /** Open the empty-area context menu at the pointer. */
      function openAreaMenu(event) {
        event.preventDefault();
        if (event.target && event.target.closest && event.target.closest(".dfx-row, .dfx-tile")) return;
        setMenu({ x: event.clientX, y: event.clientY, entry: null });
      }

      /** Select a row and open its context menu. */
      function openRowMenu(event, entry) {
        event.preventDefault();
        event.stopPropagation();
        if (selectedPaths.indexOf(entry.path) === -1) {
          setSelected(entry);
          setSelectedPaths([entry.path]);
          setAnchorPath(entry.path);
          fillPane(entry);
        }
        setMenu({ x: event.clientX, y: event.clientY, entry: entry });
        if (rowsRef.current && rowsRef.current.focus) rowsRef.current.focus({ preventScroll: true });
      }

      /** Keyboard navigation and file shortcuts on the list. */
      function onKeyDown(event) {
        var meta = event.metaKey || event.ctrlKey;
        if (meta && (event.key === "1" || event.key === "2")) {
          changeView(VIEW_MODES[Number(event.key) - 1]);
          event.preventDefault();
          return;
        }
        if (meta && (event.key === "a" || event.key === "A")) {
          if (event.shiftKey) { clearSelection(); } else if (event.altKey) { invertSelection(); } else { selectAllRows(); }
          event.preventDefault();
          return;
        }
        if (event.key === "Escape" && !meta) {
          clearSelection();
          return;
        }
        if (meta && (event.key === "c" || event.key === "C")) {
          clipboardFromSelection("copy");
          event.preventDefault();
          return;
        }
        if (meta && (event.key === "x" || event.key === "X")) {
          clipboardFromSelection("cut");
          event.preventDefault();
          return;
        }
        if (meta && (event.key === "v" || event.key === "V")) {
          paste();
          event.preventDefault();
          return;
        }
        if (event.key === "Delete" || (meta && event.key === "Backspace")) {
          askDeleteSelection();
          event.preventDefault();
          return;
        }
        if (event.key === "F2" && selected) {
          askRename(selected);
          event.preventDefault();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (rows.length === 0) return;
          event.preventDefault();
          var index = selected ? rows.findIndex(function (row) { return row.path === selected.path; }) : -1;
          var next = event.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0);
          var entry = rows[next];
          if (!entry) return;
          selectEntry(entry);
          return;
        }
        if (event.key === "Enter" && selected) {
          event.preventDefault();
          openEntry(selected);
          return;
        }
        if (event.key === "Backspace" && listing && listing.parent) {
          event.preventDefault();
          load(listing.parent);
        }
      }

      /** One clickable column label in the list header. */
      var headCell = function (key, label) {
        return h("button", {
          type: "button",
          className: "dfx-headcell",
          onClick: function () { setSort(key); },
        }, label, sort === key ? glyph("chevron", 11) : null);
      };

      var body = null;
      if (status === "error") {
        body = h("div", { className: "dfx-notice dfx-notice--error" }, "读取失败：" + (error || "未知错误"));
      } else if (status === "loading" && !listing) {
        body = h("div", { className: "dfx-empty" }, "正在加载…");
      } else if (rows.length === 0) {
        body = h("div", { className: "dfx-empty" }, query ? "没有匹配的条目" : "此目录为空");
      } else if (view === "icons") {
        body = rows.map(function (entry) {
          var isSelected = !!selected && selected.path === entry.path;
          return h("div", {
            key: entry.path,
            className: "dfx-tile" + (selectedPaths.indexOf(entry.path) !== -1 ? " dfx-tile--sel" : ""),
            title: entry.name,
            onClick: function (event) { applyClick(entry, event); },
            onDoubleClick: function () { openEntry(entry); },
            onContextMenu: function (event) { openRowMenu(event, entry); },
          },
            h("span", { className: "dfx-tile-icon" + (entry.dir ? " dfx-tile-icon--folder" : "") }, glyph(entryShape(entry), 44)),
            h("span", { className: "dfx-tile-name" + (entry.hidden ? " dfx-name-text--dim" : "") }, entry.name));
        });
      } else {
        body = rows.map(function (entry) {
          var isSelected = !!selected && selected.path === entry.path;
          return h("div", {
            key: entry.path,
            className: "dfx-row" + (selectedPaths.indexOf(entry.path) !== -1 ? " dfx-row--sel" : ""),
            title: entry.name,
            onClick: function (event) { applyClick(entry, event); },
            onDoubleClick: function () { openEntry(entry); },
            onContextMenu: function (event) { openRowMenu(event, entry); },
          },
            h("div", { className: "dfx-name" },
              h("span", { className: "dfx-name-icon" + (entry.dir ? " dfx-name-icon--folder" : "") }, glyph(entryShape(entry), 16)),
              h("span", { className: "dfx-name-text" + (entry.hidden ? " dfx-name-text--dim" : "") }, entry.name)),
            h("div", { className: "dfx-cell" }, kindLabel(entry)),
            h("div", { className: "dfx-cell" }, entry.dir ? "" : formatSize(entry.size)),
            h("div", { className: "dfx-cell" }, formatDate(entry.mtime)));
        });
      }

      /** Header shared by both right-hand panes, with the preview/details switch. */
      var paneHeader = function (entry) {
        var modeButton = function (id, label, disabled) {
          return h("button", {
            key: id,
            type: "button",
            "aria-pressed": paneMode === id ? "true" : "false",
            disabled: !!disabled,
            onClick: function () {
              if (!entry || disabled) return;
              if (id === "info") { openInfo(entry); return; }
              setPaneMode("preview");
              openPreview(entry);
            },
          }, label);
        };
        return h("div", { className: "dfx-preview-head" },
          h("span", { className: "dfx-name-icon" }, glyph(entry ? entryShape(entry) : "file", 16)),
          h("span", { className: "dfx-preview-title" }, entry ? entry.name : "详情"),
          h("div", { className: "dfx-panemode", role: "group", "aria-label": "右侧面板" },
            modeButton("preview", "预览", !!entry && entry.dir),
            modeButton("info", "详情", !entry)));
      };

      /** Definition list rendered by the details pane. */
      var infoRows = function (data) {
        var rows = [
          ["名称", data.name],
          ["类型", kindLabel({ dir: data.dir, kind: data.kind })],
          ["大小", data.dir ? (data.items === null ? "—" : data.items + " 项") : formatSize(data.size)],
          ["位置", data.parent],
          ["创建时间", formatDate(data.birthtime)],
          ["修改时间", formatDate(data.mtime)],
          ["权限", data.mode + " · " + data.modeOctal],
        ];
        if (data.link) rows.push(["符号链接", "是"]);
        return h("div", { className: "dfx-info" }, rows.map(function (row) {
          return h("div", { key: row[0], className: "dfx-info-row" },
            h("span", { className: "dfx-info-label" }, row[0]),
            h("span", { className: "dfx-info-value" }, row[1]));
        }));
      };

      /** Copy-path and reveal actions, identical in both panes. */
      var paneFooter = function (entry) {
        if (!entry) return null;
        return h("div", { className: "dfx-preview-foot" },
          h("button", { type: "button", className: "dfx-pill", onClick: function () { copyText(entry.path, "已复制路径"); } },
            glyph("copy", 12), "复制路径"),
          h("button", { type: "button", className: "dfx-pill", onClick: function () { revealPath(entry.path); } },
            glyph("reveal", 12), "在访达中显示"));
      };

      var selectionEntriesNow = selectionEntries();
      var selectionCount = selectionEntriesNow.length;
      var hasSelection = selectionCount > 0;
      var selectionBytes = selectionEntriesNow.reduce(function (total, entry) {
        return entry.dir ? total : total + (entry.size || 0);
      }, 0);
      var sortName = sort === "size" ? "大小" : sort === "mtime" ? "修改时间" : "名称";

      var showInfoPane = paneVisible && !!selected && (selected.dir || paneMode === "info");
      var previewPane = null;
      if (!paneVisible) {
        previewPane = null;
      } else if (showInfoPane) {
        var infoInner = null;
        if (detailsStatus === "loading") {
          infoInner = h("div", { className: "dfx-empty" }, "正在读取详情…");
        } else if (details && details.error) {
          infoInner = h("div", { className: "dfx-notice dfx-notice--error" }, "无法读取详情：" + details.error);
        } else if (details && details.body) {
          infoInner = infoRows(details.body);
        }
        previewPane = h("div", { className: "dfx-preview" },
          paneHeader(selected),
          h("div", { className: "dfx-preview-body" }, infoInner),
          paneFooter(selected));
      } else if (preview || previewStatus === "loading") {
        var meta = null;
        var inner = null;
        if (previewStatus === "loading") {
          inner = h("div", { className: "dfx-empty" }, "正在打开…");
        } else if (previewStatus === "error" || (preview && preview.error)) {
          inner = h("div", { className: "dfx-notice dfx-notice--error" }, "无法预览：" + (preview && preview.error ? preview.error : "未知错误"));
        } else if (preview && preview.body) {
          var payload = preview.body;
          meta = h("div", { className: "dfx-preview-meta" },
            h("span", null, formatSize(payload.size)),
            h("span", null, formatDate(payload.mtime)),
            payload.mime ? h("span", null, payload.mime) : null);
          if (payload.kind === "text") {
            inner = h("pre", { className: "dfx-pre" }, payload.text);
          } else if (payload.kind === "image") {
            inner = h("img", { className: "dfx-image", src: payload.dataUrl, alt: preview.entry.name });
          } else if (payload.kind === "too-large") {
            inner = h("div", { className: "dfx-empty" }, "文件过大，未生成预览");
          } else {
            inner = h("div", { className: "dfx-empty" }, "二进制文件，不支持预览");
          }
        }
        var paneEntry = preview && preview.entry ? preview.entry : selected;
        previewPane = h("div", { className: "dfx-preview" },
          paneHeader(paneEntry),
          meta,
          h("div", { className: "dfx-preview-body" }, inner),
          paneFooter(paneEntry));
      }

      var menuNode = null;
      if (menu) {
        var estimated = 12;
        menuItems.forEach(function (item) { estimated += item.separator ? 9 : 30; });
        var viewportWidth = (typeof window !== "undefined" && window.innerWidth) || 1280;
        var viewportHeight = (typeof window !== "undefined" && window.innerHeight) || 800;
        var left = Math.max(8, Math.min(menu.x, viewportWidth - 238));
        var top = Math.max(8, Math.min(menu.y, viewportHeight - estimated - 8));
        menuNode = h("div", {
          className: "dfx-menu",
          role: "menu",
          style: { left: left + "px", top: top + "px" },
          onMouseDown: function (event) { event.stopPropagation(); },
          onContextMenu: function (event) { event.preventDefault(); },
        }, menuItems.map(function (item, index) {
          if (item.separator) return h("div", { key: "sep-" + index, className: "dfx-menu-sep" });
          return h("button", {
            key: item.id,
            type: "button",
            role: "menuitem",
            className: "dfx-menu-item" + (item.danger ? " dfx-menu-item--danger" : ""),
            disabled: !!item.disabled,
            onClick: function () { menuAction(item.id); },
          },
            h("span", { className: "dfx-menu-icon" }, glyph(item.icon, 14)),
            h("span", { className: "dfx-menu-label" }, item.label),
            item.hint ? h("span", { className: "dfx-menu-hint" }, item.hint) : null);
        }));
      }

      var popupNode = null;
      if (popup && popupItems.length > 0) {
        var popupHeight = 12;
        popupItems.forEach(function (item) { popupHeight += item.separator ? 9 : 30; });
        var popupWidth = (typeof window !== "undefined" && window.innerWidth) || 1280;
        var popupViewHeight = (typeof window !== "undefined" && window.innerHeight) || 800;
        var popupLeft = Math.max(8, Math.min(popup.x, popupWidth - 230));
        var popupTop = Math.max(8, Math.min(popup.y, popupViewHeight - popupHeight - 8));
        popupNode = h("div", {
          className: "dfx-menu dfx-popup",
          role: "menu",
          style: { left: popupLeft + "px", top: popupTop + "px" },
          onMouseDown: function (event) { event.stopPropagation(); },
          onContextMenu: function (event) { event.preventDefault(); },
        }, popupItems.map(function (item, index) {
          if (item.separator) return h("div", { key: "psep-" + index, className: "dfx-menu-sep" });
          return h("button", {
            key: item.id,
            type: "button",
            role: "menuitem",
            className: "dfx-menu-item",
            disabled: !!item.disabled,
            onClick: function () { popupAction(item.id); },
          },
            h("span", { className: "dfx-menu-icon" }, item.checked ? glyph("check", 13) : item.icon ? glyph(item.icon, 14) : null),
            h("span", { className: "dfx-menu-label" }, item.label),
            item.hint ? h("span", { className: "dfx-menu-hint" }, item.hint) : null);
        }));
      }

      var dialogNode = null;
      if (dialog) {
        var close = function () { setDialog(null); };
        if (dialog.kind === "about") {
          dialogNode = h(AboutDialog, { meta: about, onClose: close });
        } else if (dialog.kind === "confirm") {
          dialogNode = h(ConfirmDialog, {
            title: dialog.title,
            message: dialog.message,
            confirmLabel: dialog.confirmLabel,
            danger: !!dialog.danger,
            busy: busy,
            onCancel: close,
            onConfirm: function () { var run = dialog.onConfirm; setDialog(null); run(); },
          });
        } else {
          dialogNode = h(PromptDialog, {
            title: dialog.title,
            label: dialog.label,
            value: dialog.value,
            confirmLabel: dialog.confirmLabel,
            busy: busy,
            onCancel: close,
            onSubmit: function (value) { var run = dialog.onSubmit; setDialog(null); run(value); },
          });
        }
      }

      return h("div", { className: "dfx-root", ref: rootRef },
        h("div", { className: "dfx-bar" },
          h("div", { className: "dfx-bar-actions" },
            h("button", {
              type: "button", className: "dfx-navbtn", title: "上一级 (Backspace)",
              disabled: !listing || !listing.parent,
              onClick: function () { if (listing && listing.parent) load(listing.parent); },
            }, glyph("up", 16)),
            h("button", {
              type: "button", className: "dfx-navbtn", title: "主目录",
              onClick: function () { load(null); },
            }, glyph("home", 16)),
            h("button", {
              type: "button", className: "dfx-navbtn", title: "刷新",
              onClick: function () { load(listing ? listing.path : null); },
            }, h("span", { className: status === "loading" ? "dfx-spin" : undefined }, glyph("refresh", 16)))),
          h("div", {
            className: "dfx-crumbs" + (addressDraft === null ? "" : " dfx-crumbs--edit"),
            title: addressDraft === null ? (listing ? listing.path + "（双击输入路径）" : "") : "",
            onDoubleClick: function () { startAddressEdit(); },
          }, addressDraft === null
            ? crumbs.map(function (crumb, index) {
                var last = index === crumbs.length - 1;
                return h(Fragment, { key: crumb.path },
                  index > 0 ? h("span", { className: "dfx-sep" }, glyph("chevron", 11)) : null,
                  h("button", {
                    type: "button",
                    className: "dfx-crumb" + (last ? " dfx-crumb--last" : ""),
                    title: crumb.path,
                    onClick: function () { if (!last) load(crumb.path); },
                  }, crumb.label));
              })
            : h("input", {
                ref: addressRef,
                className: "dfx-address",
                value: addressDraft,
                spellCheck: false,
                autoComplete: "off",
                "aria-label": "路径",
                onChange: function (event) { setAddressDraft(event.target.value); },
                onKeyDown: function (event) {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitAddress(addressDraft);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setAddressDraft(null);
                  }
                },
                onBlur: function () { setAddressDraft(null); },
              })),
          h("label", { className: "dfx-search" },
            glyph("search", 13),
            h("input", {
              ref: searchRef,
              type: "search",
              value: query,
              placeholder: "筛选当前目录",
              onChange: function (event) { setQuery(event.target.value); },
            }))),
        h("div", { className: "dfx-toolbar", role: "toolbar", "aria-label": "文件操作" },
          h("button", {
            type: "button",
            className: "dfx-tool" + (popup && popup.kind === "new" ? " dfx-tool--open" : ""),
            title: "新建文件夹或文件",
            disabled: !listing,
            onClick: function (event) { openPopup("new", event); },
          }, glyph("plus", 14), h("span", { className: "dfx-tool-label" }, "新建"), glyph("chevronDown", 12)),
          h("span", { className: "dfx-toolbar-sep" }),
          [
            ["cut", "剪切", "scissors", !hasSelection, null],
            ["copy", "复制", "copy", !hasSelection, null],
            ["paste", "粘贴", "paste", !clipboard, null],
            null,
            ["rename", "重命名", "pencil", selectionCount !== 1, null],
            ["trash", "删除", "trash", !hasSelection, null],
            null,
          ].map(function (item, index) {
            if (!item) return h("span", { key: "sep-" + index, className: "dfx-toolbar-sep" });
            return h("button", {
              key: item[0],
              type: "button",
              className: "dfx-tool",
              disabled: item[3],
              title: item[1],
              onClick: function () { toolAction(item[0]); },
            }, glyph(item[2], 14), h("span", { className: "dfx-tool-label" }, item[1]));
          }),
          h("button", {
            type: "button",
            className: "dfx-tool" + (showHidden ? " dfx-tool--open" : ""),
            title: showHidden ? "隐藏以点开头的条目" : "显示以点开头的条目",
            "aria-pressed": showHidden ? "true" : "false",
            onClick: function () { setShowHidden(!showHidden); },
          }, glyph(showHidden ? "eye" : "hidden", 14), h("span", { className: "dfx-tool-label" }, "隐藏文件")),
          h("span", { className: "dfx-toolbar-sep" }),
          h("button", {
            type: "button",
            className: "dfx-tool" + (popup && popup.kind === "sort" ? " dfx-tool--open" : ""),
            title: "排序方式",
            onClick: function (event) { openPopup("sort", event); },
          }, glyph("sortIcon", 14), h("span", { className: "dfx-tool-label" }, "排序"), glyph("chevronDown", 12)),
          h("button", {
            type: "button",
            className: "dfx-tool" + (popup && popup.kind === "more" ? " dfx-tool--open" : ""),
            title: "更多操作",
            onClick: function (event) { openPopup("more", event); },
          }, glyph("moreIcon", 14), h("span", { className: "dfx-tool-label" }, "更多"), glyph("chevronDown", 12)),
          h("div", { className: "dfx-viewswitch", role: "group", "aria-label": "显示视图" },
            VIEW_OPTIONS.map(function (option) {
              var active = view === option.id;
              return h("button", {
                key: option.id,
                type: "button",
                className: "dfx-navbtn" + (active ? " dfx-navbtn--active" : ""),
                title: option.label + "（" + accel(String(VIEW_MODES.indexOf(option.id) + 1)) + "）",
                "aria-label": option.label + "视图",
                "aria-pressed": active ? "true" : "false",
                onClick: function () { changeView(option.id); },
              }, glyph(option.icon, 16));
            }),
            h("button", {
              type: "button",
              className: "dfx-navbtn dfx-panebtn" + (paneVisible ? " dfx-navbtn--active" : ""),
              title: paneVisible ? "隐藏右侧预览" : "显示右侧预览",
              "aria-label": "预览面板",
              "aria-pressed": paneVisible ? "true" : "false",
              onClick: function () { setPaneVisible(!paneVisible); },
            }, glyph("pane", 16)))),
        h("div", { className: "dfx-body" },
          h("div", { className: "dfx-listpane" },
            view === "icons" ? null : h("div", { className: "dfx-head" },
              headCell("name", "名称"),
              h("span", { className: "dfx-headcell dfx-headcell--static" }, "类型"),
              headCell("size", "大小"),
              headCell("mtime", "修改时间")),

            h("div", {
              className: "dfx-rows" + (view === "icons" ? " dfx-rows--grid" : ""),
              ref: rowsRef,
              tabIndex: 0,
              onKeyDown: onKeyDown,
              onContextMenu: openAreaMenu,
              onScroll: function () { if (menu) setMenu(null); },
            }, body)),
          previewPane),
        h("div", { className: "dfx-foot" },
          h("span", null, rows.length + " 项"),
          listing && listing.truncated ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", null, "已截断，仅列出前 2000 项")) : null,
          selectionCount > 0 ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", { className: "dfx-foot-strong" }, "已选 " + selectionCount + " 项")) : null,
          selectionBytes > 0 ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", null, formatSize(selectionBytes))) : null,
          clipboard ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", null, (clipboard.mode === "cut" ? "已剪切 " : "已拷贝 ") + clipboard.paths.length + " 项")) : null,
          h("span", { style: { flex: "1 1 auto" } }),
          busy ? h("span", null, "处理中…") : null,
          notice ? h("span", { className: notice.tone === "error" ? "dfx-foot-error" : undefined }, notice.text) : null,
          showHidden ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", null, "显示隐藏文件"),
            h("span", { className: "dfx-foot-dot" })) : null,
          h("span", { className: "dfx-foot-meta" },
            (view === "icons" ? "图标视图" : "列表视图") + " · 按" + sortName + "排序")),
        menuNode,
        popupNode,
        dialogNode);
    }

    /**
     * Register the sidebar entry and the panel it opens.
     * @param {object} ctx - client plugin context
     */
    function apply(ctx) {
      ctx.effect(function () {
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return function () { style.remove(); };
      }, "dsh-file-explorer: styles");

      ctx.slots.inject("main", function () {
        return ctx.slots.register({ name: "main", key: PANEL_ID }, FileExplorerPanel);
      });

      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register({
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: 20,
          label: "文件管理器",
        }, PanelIcon);
      });
    }

    exports.SHAPES = SHAPES;
    exports.entryShape = entryShape;
    exports.kindLabel = kindLabel;
    exports.PANEL_ID = PANEL_ID;
    exports.FileExplorerPanel = FileExplorerPanel;
    exports.PanelIcon = PanelIcon;
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
