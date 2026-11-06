/**
 * KaTeX 字体的内联版本。
 *
 * 以 woff2 数据 URL 嵌入，使导出的 HTML 在不携带 `assets/` 目录时
 * 依然能正确排版公式。模块体积较大，只在导出时按需动态导入。
 */
import amsRegular from "katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline";
import caligraphicBold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline";
import caligraphicRegular from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline";
import frakturBold from "katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline";
import frakturRegular from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline";
import mainBold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?inline";
import mainBoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline";
import mainItalic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?inline";
import mainRegular from "katex/dist/fonts/KaTeX_Main-Regular.woff2?inline";
import mathBoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline";
import mathItalic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?inline";
import sansBold from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline";
import sansItalic from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline";
import sansRegular from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline";
import scriptRegular from "katex/dist/fonts/KaTeX_Script-Regular.woff2?inline";
import size1 from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline";
import size2 from "katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline";
import size3 from "katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline";
import size4 from "katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline";
import typewriterRegular from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline";

interface FontFace {
  family: string;
  style: "normal" | "italic";
  weight: "normal" | "bold";
  url: string;
}

const FACES: FontFace[] = [
  { family: "KaTeX_AMS", style: "normal", weight: "normal", url: amsRegular },
  { family: "KaTeX_Caligraphic", style: "normal", weight: "bold", url: caligraphicBold },
  { family: "KaTeX_Caligraphic", style: "normal", weight: "normal", url: caligraphicRegular },
  { family: "KaTeX_Fraktur", style: "normal", weight: "bold", url: frakturBold },
  { family: "KaTeX_Fraktur", style: "normal", weight: "normal", url: frakturRegular },
  { family: "KaTeX_Main", style: "normal", weight: "bold", url: mainBold },
  { family: "KaTeX_Main", style: "italic", weight: "bold", url: mainBoldItalic },
  { family: "KaTeX_Main", style: "italic", weight: "normal", url: mainItalic },
  { family: "KaTeX_Main", style: "normal", weight: "normal", url: mainRegular },
  { family: "KaTeX_Math", style: "italic", weight: "bold", url: mathBoldItalic },
  { family: "KaTeX_Math", style: "italic", weight: "normal", url: mathItalic },
  { family: "KaTeX_SansSerif", style: "normal", weight: "bold", url: sansBold },
  { family: "KaTeX_SansSerif", style: "italic", weight: "normal", url: sansItalic },
  { family: "KaTeX_SansSerif", style: "normal", weight: "normal", url: sansRegular },
  { family: "KaTeX_Script", style: "normal", weight: "normal", url: scriptRegular },
  { family: "KaTeX_Size1", style: "normal", weight: "normal", url: size1 },
  { family: "KaTeX_Size2", style: "normal", weight: "normal", url: size2 },
  { family: "KaTeX_Size3", style: "normal", weight: "normal", url: size3 },
  { family: "KaTeX_Size4", style: "normal", weight: "normal", url: size4 },
  { family: "KaTeX_Typewriter", style: "normal", weight: "normal", url: typewriterRegular },
];

/** 生成覆盖 KaTeX 原字体声明的 @font-face 规则 */
export function buildKatexFontCss(): string {
  return FACES.map(
    (face) =>
      `@font-face { font-family: ${face.family}; font-style: ${face.style}; font-weight: ${face.weight}; src: url(${face.url}) format("woff2"); }`
  ).join("\n");
}
