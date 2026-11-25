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
    var PANEL_ID = "file-explorer";
    /** Host route prefix served by lib/index.js. */
    var API = "/api/file-explorer";
    var STYLE_ID = "dsh-file-explorer-style";

    /** Remembered navigation and clipboard so switching panels does not lose them. */
    var remembered = { path: null, clipboard: null };


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
.dfx-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px 8px; flex: 0 0 auto; }
.dfx-bar-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.dfx-navbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, #5c5c5c);
  cursor: pointer; flex: 0 0 auto;
}
.dfx-navbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-navbtn:disabled { opacity: .35; cursor: default; }
.dfx-crumbs { display: flex; align-items: center; gap: 1px; flex: 1 1 auto; min-width: 0; overflow: hidden; height: 28px; }
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
  display: flex; align-items: center; gap: 6px; width: 190px; height: 28px; padding: 0 9px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  background: var(--dsw-alias-bg-layer-2, #fafafa); color: var(--dsw-alias-label-secondary, #5c5c5c); flex: 0 0 auto;
}
.dfx-search input { flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
.dfx-search input::-webkit-search-cancel-button { display: none; }
.dfx-body { display: flex; flex: 1 1 auto; min-height: 0; }
.dfx-listpane { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.dfx-head {
  display: grid; grid-template-columns: minmax(0, 1fr) 92px 148px; align-items: center; gap: 12px;
  height: 26px; padding: 0 14px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07));
}
.dfx-headcell { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.dfx-headcell:hover { color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-rows { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 10px; outline: none; }
.dfx-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 92px 148px; align-items: center; gap: 12px;
  height: 30px; padding: 0 14px; cursor: default; user-select: none;
}
.dfx-row:hover { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .045)); }
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
.dfx-pill {
  display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .12));
  background: transparent; color: var(--dsw-alias-label-secondary, #5c5c5c); font: inherit; font-size: 12px; cursor: pointer;
}
.dfx-pill:hover { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1b1b1b); }
.dfx-foot { display: flex; align-items: center; gap: 12px; height: 26px; padding: 0 14px; flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, #8f8f8f); font-size: 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .07)); }
.dfx-foot-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .5; }
.dfx-foot-error { color: var(--dsw-alias-label-danger, #c0392b); }
.dfx-spin { animation: dfx-spin 1s linear infinite; }
@keyframes dfx-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .dfx-spin { animation: none; } }
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
.dfx-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, .05)); }
.dfx-btn--primary { border-color: transparent; background: var(--dsw-alias-bg-brand, #3b6cf6); color: #fff; }
.dfx-btn--primary:hover:not(:disabled) { background: var(--dsw-alias-bg-brand-hover, #2f5ce0); }
.dfx-btn--danger { border-color: transparent; background: var(--dsw-alias-bg-danger, #d9534f); color: #fff; }
.dfx-btn:disabled { opacity: .5; cursor: default; }
`;

    /**
     * Build one stroked icon element.
     * @param {Array} shapes - child elements
     * @param {number} size - square edge in pixels
     * @returns {object} svg element
     */
    function icon(shapes, size) {
      return h("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
        "aria-hidden": "true", focusable: "false",
      }, shapes);
    }

    /** Named icon shapes (arrays of SVG path data). */
    var SHAPES = {
      folder: ["M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.8 2.2h8.2A1.5 1.5 0 0 1 20 9.7v7.8A1.5 1.5 0 0 1 18.5 19h-14A1.5 1.5 0 0 1 3 17.5z"],
      file: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5"],
      image: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5", "M8.5 17.5l3-3 2 2 2-2"],
      code: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5", "M10 13l-1.6 1.6L10 16.2", "M14 13l1.6 1.6L14 16.2"],
      pdf: ["M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z", "M13 3.5v5h5", "M8.5 17.5h7"],
      up: ["M12 19V6", "M6 12l6-6 6 6"],
      home: ["M4 11l8-6.5 8 6.5", "M6.5 9.5V20h11V9.5"],
      refresh: ["M20 12a8 8 0 1 1-2.34-5.66", "M20 4.5V10h-5.5"],
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
    };

    /**
     * Render a named icon.
     * @param {string} name - shape name
     * @param {number} size - square edge
     * @returns {object} svg element
     */
    function glyph(name, size) {
      var paths = SHAPES[name] || SHAPES.file;
      return icon(paths.map(function (d, index) {
        return h("path", { key: index, d: d });
      }), size);
    }

    /**
     * The icon shape an entry should use.
     * @param {object} entry - listing row
     * @returns {string} shape name
     */
    function entryShape(entry) {
      if (!entry) return "file";
      if (entry.dir) return "folder";
      if (entry.kind === "image") return "image";
      if (entry.kind === "text") return "code";
      if (entry.kind === "pdf") return "pdf";
      return "file";
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
      var [selected, setSelected] = useState(null);
      var [preview, setPreview] = useState(null);
      var [previewStatus, setPreviewStatus] = useState("idle");
      var [notice, setNotice] = useState(null);
      var [menu, setMenu] = useState(null);
      var [dialog, setDialog] = useState(null);
      var [clipboard, setClipboard] = useState(remembered.clipboard);
      var [busy, setBusy] = useState(false);
      var requestSeq = useRef(0);
      var rowsRef = useRef(null);
      var searchRef = useRef(null);
      var previewRef = useRef(null);
      var listingRef = useRef(null);

      listingRef.current = listing;

      var notify = useCallback(function (text, tone) {
        setNotice({ text: text, tone: tone || "info" });
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
          setSelected(focus);
          if (focus && !focus.dir) previewRef.current(focus);
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

      var openEntry = useCallback(function (entry) {
        if (!entry) return;
        if (entry.dir) { load(entry.path); return; }
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

      var putClipboard = useCallback(function (entry, mode) {
        var next = { paths: [entry.path], mode: mode };
        remembered.clipboard = next;
        setClipboard(next);
        notify((mode === "cut" ? "已剪切 " : "已拷贝 ") + entry.name, "info");
      }, [notify]);

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
        });
        if (mode === "move") {
          remembered.clipboard = null;
          setClipboard(null);
        }
      }, [mutate, notify]);

      /** Open the rename dialog for one entry. */
      function askRename(entry) {
        setDialog({
          kind: "prompt", title: "重新命名", label: "新名称", value: entry.name, confirmLabel: "重新命名",
          onSubmit: function (name) {
            mutate({ route: "/rename", params: { path: entry.path, name: name }, success: "已重新命名" });
          },
        });
      }

      /** Ask before moving one entry to the Trash. */
      function askTrash(entry) {
        setDialog({
          kind: "confirm", title: "移到废纸篓", danger: true, confirmLabel: "移到废纸篓",
          message: "“" + entry.name + "”将被移到废纸篓，可以从废纸篓找回。",
          onConfirm: function () {
            mutate({ route: "/trash", params: { path: entry.path }, success: "已移到废纸篓" });
          },
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
        if (id === "mkdir") {
          setDialog({
            kind: "prompt", title: "新建文件夹", label: "文件夹名称", value: "未命名文件夹", confirmLabel: "创建",
            onSubmit: function (name) {
              mutate({ route: "/mkdir", params: { path: current.path, name: name }, success: "已新建文件夹" });
            },
          });
          return;
        }
        if (id === "newfile") {
          setDialog({
            kind: "prompt", title: "新建文件", label: "文件名称", value: "未命名.txt", confirmLabel: "创建",
            onSubmit: function (name) {
              mutate({ route: "/newfile", params: { path: current.path, name: name }, success: "已新建文件" });
            },
          });
          return;
        }
        if (!entry) return;
        if (id === "open") { openEntry(entry); return; }
        if (id === "openApp") { openWithApp(entry.path); return; }
        if (id === "reveal") { revealPath(entry.path); return; }
        if (id === "copy") { putClipboard(entry, "copy"); return; }
        if (id === "cut") { putClipboard(entry, "cut"); return; }
        if (id === "copyPath") { copyText(entry.path, "已复制路径"); return; }
        if (id === "copyName") { copyText(entry.name, "已复制名称"); return; }
        if (id === "duplicate") { mutate({ route: "/duplicate", params: { path: entry.path }, success: "已复制副本" }); return; }
        if (id === "rename") { askRename(entry); return; }
        if (id === "trash") { askTrash(entry); return; }
      }

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

      var menuItems = useMemo(function () {
        if (!menu) return [];
        var entry = menu.entry;
        if (entry) {
          return [
            { id: "open", label: entry.dir ? "打开" : "预览", icon: entry.dir ? "folder" : "file" },
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
        if (event.target && event.target.closest && event.target.closest(".dfx-row")) return;
        setMenu({ x: event.clientX, y: event.clientY, entry: null });
      }

      /** Select a row and open its context menu. */
      function openRowMenu(event, entry) {
        event.preventDefault();
        event.stopPropagation();
        setSelected(entry);
        setMenu({ x: event.clientX, y: event.clientY, entry: entry });
        if (rowsRef.current && rowsRef.current.focus) rowsRef.current.focus({ preventScroll: true });
      }

      /** Keyboard navigation and file shortcuts on the list. */
      function onKeyDown(event) {
        var meta = event.metaKey || event.ctrlKey;
        if (meta && (event.key === "c" || event.key === "C")) {
          if (selected) { putClipboard(selected, "copy"); event.preventDefault(); }
          return;
        }
        if (meta && (event.key === "x" || event.key === "X")) {
          if (selected) { putClipboard(selected, "cut"); event.preventDefault(); }
          return;
        }
        if (meta && (event.key === "v" || event.key === "V")) {
          paste();
          event.preventDefault();
          return;
        }
        if (event.key === "Delete" || (meta && event.key === "Backspace")) {
          if (selected) { askTrash(selected); event.preventDefault(); }
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
          setSelected(entry);
          if (!entry.dir) openPreview(entry);
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
      } else {
        body = rows.map(function (entry) {
          var isSelected = !!selected && selected.path === entry.path;
          return h("div", {
            key: entry.path,
            className: "dfx-row" + (isSelected ? " dfx-row--sel" : ""),
            title: entry.name,
            onClick: function () {
              setSelected(entry);
              if (!entry.dir) openPreview(entry);
            },
            onDoubleClick: function () { openEntry(entry); },
            onContextMenu: function (event) { openRowMenu(event, entry); },
          },
            h("div", { className: "dfx-name" },
              h("span", { className: "dfx-name-icon" + (entry.dir ? " dfx-name-icon--folder" : "") }, glyph(entryShape(entry), 15)),
              h("span", { className: "dfx-name-text" + (entry.hidden ? " dfx-name-text--dim" : "") }, entry.name)),
            h("div", { className: "dfx-cell" }, entry.dir ? "" : formatSize(entry.size)),
            h("div", { className: "dfx-cell" }, formatDate(entry.mtime)));
        });
      }

      var previewPane = null;
      if (preview || previewStatus === "loading") {
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
        previewPane = h("div", { className: "dfx-preview" },
          h("div", { className: "dfx-preview-head" },
            h("span", { className: "dfx-name-icon" }, glyph(preview && preview.entry ? entryShape(preview.entry) : "file", 15)),
            h("span", { className: "dfx-preview-title" }, preview && preview.entry ? preview.entry.name : "预览")),
          meta,
          h("div", { className: "dfx-preview-body" }, inner),
          preview && preview.entry ? h("div", { className: "dfx-preview-foot" },
            h("button", { type: "button", className: "dfx-pill", onClick: function () { copyText(preview.entry.path, "已复制路径"); } },
              glyph("copy", 12), "复制路径"),
            h("button", { type: "button", className: "dfx-pill", onClick: function () { revealPath(preview.entry.path); } },
              glyph("reveal", 12), "在访达中显示")) : null);
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

      var dialogNode = null;
      if (dialog) {
        var close = function () { setDialog(null); };
        if (dialog.kind === "confirm") {
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

      return h("div", { className: "dfx-root" },
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
          h("div", { className: "dfx-crumbs" }, crumbs.map(function (crumb, index) {
            var last = index === crumbs.length - 1;
            return h(Fragment, { key: crumb.path },
              index > 0 ? h("span", { className: "dfx-sep" }, glyph("chevron", 11)) : null,
              h("button", {
                type: "button",
                className: "dfx-crumb" + (last ? " dfx-crumb--last" : ""),
                title: crumb.path,
                onClick: function () { if (!last) load(crumb.path); },
              }, crumb.label));
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
        h("div", { className: "dfx-body" },
          h("div", { className: "dfx-listpane" },
            h("div", { className: "dfx-head" },
              headCell("name", "名称"),
              headCell("size", "大小"),
              headCell("mtime", "修改时间")),
            h("div", {
              className: "dfx-rows",
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
          h("span", { className: "dfx-foot-dot" }),
          h("button", {
            type: "button", className: "dfx-pill",
            title: showHidden ? "隐藏以点开头的条目" : "显示以点开头的条目",
            onClick: function () { setShowHidden(!showHidden); },
          }, glyph(showHidden ? "eye" : "hidden", 12), showHidden ? "隐藏文件：开" : "隐藏文件：关"),
          clipboard ? h(Fragment, null,
            h("span", { className: "dfx-foot-dot" }),
            h("span", null, (clipboard.mode === "cut" ? "已剪切 " : "已拷贝 ") + clipboard.paths.length + " 项")) : null,
          h("span", { style: { flex: "1 1 auto" } }),
          busy ? h("span", null, "处理中…") : null,
          notice ? h("span", { className: notice.tone === "error" ? "dfx-foot-error" : undefined }, notice.text) : null),
        menuNode,
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

    exports.PANEL_ID = PANEL_ID;
    exports.FileExplorerPanel = FileExplorerPanel;
    exports.PanelIcon = PanelIcon;
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
