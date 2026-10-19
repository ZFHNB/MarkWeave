"use strict";

/**
 * Builds the Electron application menu template.
 * @param {(action: string) => void} sendAction Callback to dispatch menu actions to renderer.
 * @param {{ isDev?: boolean }} [options] Options including developer mode flag.
 * @returns {Array<Object>} Electron menu template.
 */
function buildMenuTemplate(sendAction, options = {}) {
  const isDev = Boolean(options && options.isDev);
  const action = typeof sendAction === "function" ? sendAction : () => {};

  const template = [
    {
      id: "file",
      label: "&File",
      submenu: [
        {
          id: "new-file",
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: () => action("new-file")
        },
        {
          id: "open-file",
          label: "Open File...",
          accelerator: "CmdOrCtrl+O",
          click: () => action("open-file")
        },
        { type: "separator" },
        {
          id: "save",
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => action("save")
        },
        {
          id: "save-as",
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => action("save-as")
        },
        { type: "separator" },
        {
          id: "quit",
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          role: "quit",
          click: () => action("quit")
        }
      ]
    },
    {
      id: "edit",
      label: "&Edit",
      submenu: [
        { id: "undo", label: "Undo", role: "undo" },
        { id: "redo", label: "Redo", role: "redo" },
        { type: "separator" },
        { id: "cut", label: "Cut", role: "cut" },
        { id: "copy", label: "Copy", role: "copy" },
        { id: "paste", label: "Paste", role: "paste" },
        { type: "separator" },
        { id: "selectAll", label: "Select All", role: "selectAll" }
      ]
    },
    {
      id: "insert",
      label: "&Insert",
      submenu: [
        {
          id: "insert-table",
          label: "Insert Table",
          accelerator: "CmdOrCtrl+T",
          click: () => action("insert-table")
        },
        {
          id: "insert-code-fence",
          label: "Insert Code Block",
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => action("insert-code-fence")
        },
        {
          id: "insert-math-block",
          label: "Insert Math Block",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => action("insert-math-block")
        },
        {
          id: "insert-image",
          label: "Insert Image",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => action("insert-image")
        }
      ]
    },
    {
      id: "view",
      label: "&View",
      submenu: [
        {
          id: "toggle-sidebar",
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+Shift+L",
          click: () => action("toggle-sidebar")
        },
        {
          id: "toggle-source",
          label: "Toggle Source View",
          accelerator: "CmdOrCtrl+/",
          click: () => action("toggle-source")
        },
        {
          id: "toggle-theme",
          label: "Toggle Theme",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => action("toggle-theme")
        },
        { type: "separator" },
        {
          id: "reset-zoom",
          label: "Actual Size",
          accelerator: "CmdOrCtrl+0",
          role: "resetZoom",
          click: () => action("reset-zoom")
        },
        {
          id: "zoom-in",
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          role: "zoomIn",
          click: () => action("zoom-in")
        },
        {
          id: "zoom-out",
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          role: "zoomOut",
          click: () => action("zoom-out")
        },
        ...(isDev
          ? [
              { type: "separator" },
              {
                id: "reload",
                label: "Reload",
                accelerator: "CmdOrCtrl+R",
                role: "reload",
                click: () => action("reload")
              },
              {
                id: "toggle-devtools",
                label: "Toggle Developer Tools",
                accelerator: "CmdOrCtrl+Shift+I",
                role: "toggleDevTools",
                click: () => action("toggle-devtools")
              }
            ]
          : [])
      ]
    },
    {
      id: "help",
      label: "&Help",
      submenu: [
        {
          id: "about",
          label: "About MarkWeave",
          click: () => action("about")
        }
      ]
    }
  ];

  return template;
}

module.exports = { buildMenuTemplate };
