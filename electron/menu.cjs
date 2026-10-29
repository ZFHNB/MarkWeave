"use strict";

/**
 * Chinese and English dictionaries for native menu labels.
 */
const DICTIONARIES = {
  zh: {
    file: "文件",
    "new-file": "新建文件",
    "open-file": "打开文件",
    save: "保存",
    "save-as": "另存为",
    export: "导出",
    "export-html": "导出为 HTML...",
    "export-pdf": "导出为 PDF...",
    preferences: "偏好设置...",
    quit: "退出",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    selectAll: "全选",
    insert: "插入",
    "insert-table": "插入表格",
    "insert-code-fence": "插入代码块",
    "insert-math-block": "插入公式块",
    "insert-image": "插入图片",
    view: "视图",
    "toggle-sidebar": "切换侧边栏",
    "toggle-source": "切换源码视图",
    "toggle-theme": "切换主题",
    "reset-zoom": "实际大小",
    "zoom-in": "放大",
    "zoom-out": "缩小",
    reload: "重新加载",
    "toggle-devtools": "开发者工具",
    help: "帮助",
    about: "关于 MarkWeave"
  },
  en: {
    file: "&File",
    "new-file": "New File",
    "open-file": "Open File...",
    save: "Save",
    "save-as": "Save As...",
    export: "Export",
    "export-html": "Export as HTML...",
    "export-pdf": "Export as PDF...",
    preferences: "Preferences...",
    quit: "Quit",
    edit: "&Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    insert: "&Insert",
    "insert-table": "Insert Table",
    "insert-code-fence": "Insert Code Block",
    "insert-math-block": "Insert Math Block",
    "insert-image": "Insert Image",
    view: "&View",
    "toggle-sidebar": "Toggle Sidebar",
    "toggle-source": "Toggle Source View",
    "toggle-theme": "Toggle Theme",
    "reset-zoom": "Actual Size",
    "zoom-in": "Zoom In",
    "zoom-out": "Zoom Out",
    reload: "Reload",
    "toggle-devtools": "Toggle Developer Tools",
    help: "&Help",
    about: "About MarkWeave"
  }
};

/**
 * Builds the Electron application menu template.
 * @param {(action: string) => void} sendAction Callback to dispatch menu actions to renderer.
 * @param {{ isDev?: boolean, language?: string }} [options] Options including developer mode flag and language.
 * @returns {Array<Object>} Electron menu template.
 */
function buildMenuTemplate(sendAction, options = {}) {
  const isDev = Boolean(options && options.isDev);
  const lang = options && typeof options.language === "string" && options.language.toLowerCase() === "en" ? "en" : "zh";
  const dict = DICTIONARIES[lang] || DICTIONARIES.zh;
  const action = typeof sendAction === "function" ? sendAction : () => {};

  const template = [
    {
      id: "file",
      label: dict.file,
      submenu: [
        {
          id: "new-file",
          label: dict["new-file"],
          accelerator: "CmdOrCtrl+N",
          click: () => action("new-file")
        },
        {
          id: "open-file",
          label: dict["open-file"],
          accelerator: "CmdOrCtrl+O",
          click: () => action("open-file")
        },
        { type: "separator" },
        {
          id: "save",
          label: dict.save,
          accelerator: "CmdOrCtrl+S",
          click: () => action("save")
        },
        {
          id: "save-as",
          label: dict["save-as"],
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => action("save-as")
        },
        {
          id: "export",
          label: dict.export,
          submenu: [
            {
              id: "export-html",
              label: dict["export-html"],
              click: () => action("export-html")
            },
            {
              id: "export-pdf",
              label: dict["export-pdf"],
              click: () => action("export-pdf")
            }
          ]
        },
        { type: "separator" },
        {
          id: "preferences",
          label: dict.preferences,
          accelerator: "CmdOrCtrl+,",
          click: () => action("preferences")
        },
        { type: "separator" },
        {
          id: "quit",
          label: dict.quit,
          accelerator: "CmdOrCtrl+Q",
          role: "quit",
          click: () => action("quit")
        }
      ]
    },
    {
      id: "edit",
      label: dict.edit,
      submenu: [
        { id: "undo", label: dict.undo, role: "undo" },
        { id: "redo", label: dict.redo, role: "redo" },
        { type: "separator" },
        { id: "cut", label: dict.cut, role: "cut" },
        { id: "copy", label: dict.copy, role: "copy" },
        { id: "paste", label: dict.paste, role: "paste" },
        { type: "separator" },
        { id: "selectAll", label: dict.selectAll, role: "selectAll" }
      ]
    },
    {
      id: "insert",
      label: dict.insert,
      submenu: [
        {
          id: "insert-table",
          label: dict["insert-table"],
          accelerator: "CmdOrCtrl+T",
          click: () => action("insert-table")
        },
        {
          id: "insert-code-fence",
          label: dict["insert-code-fence"],
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => action("insert-code-fence")
        },
        {
          id: "insert-math-block",
          label: dict["insert-math-block"],
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => action("insert-math-block")
        },
        {
          id: "insert-image",
          label: dict["insert-image"],
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => action("insert-image")
        }
      ]
    },
    {
      id: "view",
      label: dict.view,
      submenu: [
        {
          id: "toggle-sidebar",
          label: dict["toggle-sidebar"],
          accelerator: "CmdOrCtrl+Shift+L",
          click: () => action("toggle-sidebar")
        },
        {
          id: "toggle-source",
          label: dict["toggle-source"],
          accelerator: "CmdOrCtrl+/",
          click: () => action("toggle-source")
        },
        {
          id: "toggle-theme",
          label: dict["toggle-theme"],
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => action("toggle-theme")
        },
        { type: "separator" },
        {
          id: "reset-zoom",
          label: dict["reset-zoom"],
          accelerator: "CmdOrCtrl+0",
          role: "resetZoom",
          click: () => action("reset-zoom")
        },
        {
          id: "zoom-in",
          label: dict["zoom-in"],
          accelerator: "CmdOrCtrl+Plus",
          role: "zoomIn",
          click: () => action("zoom-in")
        },
        {
          id: "zoom-out",
          label: dict["zoom-out"],
          accelerator: "CmdOrCtrl+-",
          role: "zoomOut",
          click: () => action("zoom-out")
        },
        ...(isDev
          ? [
              { type: "separator" },
              {
                id: "reload",
                label: dict.reload,
                accelerator: "CmdOrCtrl+R",
                role: "reload",
                click: () => action("reload")
              },
              {
                id: "toggle-devtools",
                label: dict["toggle-devtools"],
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
      label: dict.help,
      submenu: [
        {
          id: "about",
          label: dict.about,
          click: () => action("about")
        }
      ]
    }
  ];

  return template;
}

module.exports = { buildMenuTemplate };
