import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "../schema";

/**
 * 图片工作流：
 * - 从本地文件选择插入图片
 * - 拖放图片文件到编辑器
 * - 粘贴剪贴板中的图片（转为 data URL）
 * - 相对路径解析（桌面版使用 file:// 绝对路径展示）
 */

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

export const imagePluginKey = new PluginKey("markweave-images");

export interface ImageInsertOptions {
  /** 桌面版可将本地路径转换为可显示 URL */
  resolveSrc?: (path: string) => string;
  /**
   * 把图片落到磁盘并返回写进 Markdown 的 src。
   *
   * 返回 null 表示"做不到"（未保存的文档、写入失败等），调用方会退回
   * data URL 内联，保证图片至少看得见。
   */
  persistFile?: (file: File) => Promise<string | null>;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function createImagePlugin(options: ImageInsertOptions = {}): Plugin {
  return new Plugin({
    key: imagePluginKey,
    props: {
      handleDOMEvents: {
        drop(view, event) {
          const files = Array.from(event.dataTransfer?.files || []).filter(
            (file) => file.type.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name)
          );
          if (files.length === 0) return false;
          event.preventDefault();

          const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const insertPos = position?.pos ?? view.state.selection.from;

          void (async () => {
            const nodes = [];
            for (const file of files) {
              const src = options.persistFile
                ? (await options.persistFile(file)) ?? (await readAsDataUrl(file))
                : await readAsDataUrl(file);
              nodes.push(
                schema.nodes.image.create({
                  src: options.resolveSrc ? options.resolveSrc(src) : src,
                  alt: file.name.replace(/\.[^.]+$/, ""),
                  title: null,
                })
              );
            }
            if (nodes.length > 0) {
              const tr = view.state.tr.insert(insertPos, nodes);
              view.dispatch(tr.scrollIntoView());
            }
          })();

          return true;
        },
        paste(view, event) {
          const items = Array.from(event.clipboardData?.items || []);
          const imageItem = items.find((item) => item.type.startsWith("image/"));
          if (!imageItem) return false;

          const file = imageItem.getAsFile();
          if (!file) return false;
          event.preventDefault();

          void (async () => {
            const src = options.persistFile
              ? (await options.persistFile(file)) ?? (await readAsDataUrl(file))
              : await readAsDataUrl(file);
            const node = schema.nodes.image.create({
              src: options.resolveSrc ? options.resolveSrc(src) : src,
              alt: "pasted-image",
              title: null,
            });
            view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
          })();

          return true;
        },
      },
    },
  });
}

/** 打开系统文件选择框插入本地图片 */
export function pickLocalImage(onPick: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onPick(file);
    input.remove();
  });
  // 用户点了「取消」时不会触发 change，靠 cancel 事件把临时 input 收掉
  input.addEventListener("cancel", () => input.remove());
  document.body.appendChild(input);
  input.click();
}

/** 把图片插入当前选区 */
export function insertImageNode(view: EditorView, src: string, alt = "", title: string | null = null): void {
  const node = schema.nodes.image.create({ src, alt, title });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}
