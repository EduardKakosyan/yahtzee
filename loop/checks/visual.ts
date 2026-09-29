/**
 * Shared visual measurement code for the UI checks.
 *
 * `collectVisual` is serialized into page.evaluate(), so it must be
 * self-contained (no imports, no closure over module scope). It walks the DOM
 * once and reports contrast / background-coverage / tap-target / overflow
 * problems, so every visual check measures with identical rules.
 */

export interface TextIssue {
  selector: string;
  text: string;
  fg: string;
  bg: string;
  candidates: string[];
  ratio: number;
  required: number;
  fontSize: number;
}

export interface CoverageIssue {
  where: string;
  y: number;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
}

export interface TapIssue { selector: string; text: string; w: number; h: number }
export interface OverflowIssue { selector: string; w: number; iw: number }
export interface SampleRecord { where: string; y: number; bg: string; candidates: string[] }

export interface VisualReport {
  pageBase: string;
  pageCandidates: string[];
  textColor: string;
  dark: boolean;
  text: TextIssue[];
  coverage: CoverageIssue[];
  tap: TapIssue[];
  overflow: OverflowIssue[];
  samples: SampleRecord[];
  doc: { scrollWidth: number; scrollHeight: number; innerWidth: number; innerHeight: number };
}

export interface VisualOptions {
  text?: boolean;
  tap?: boolean;
  overflow?: boolean;
  /** 'viewportBottom' samples the bottom of the viewport at scroll top; 'documentBottom' at scroll end. */
  coverage?: string[];
}

/** Self-contained: everything it needs is declared inside. */
export function collectVisual(opts: VisualOptions): VisualReport {
  const MIN_TEXT = 4.5;
  const MIN_LARGE = 3;
  const MIN_TAP = 43.5;

  type RGB = [number, number, number];
  type RGBA = [number, number, number, number];

  const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const lin = (c8: number) => {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = (rgb: RGB) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const contrast = (fg: RGB, bg: RGB) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const hex = (rgb: RGB) => '#' + rgb.map((v) => clamp8(v).toString(16).padStart(2, '0')).join('');
  const hexRgb = (h: string): RGB => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const parse = (v: string): RGBA | null => {
    const m = (v || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (fg: RGBA, bg: RGB): RGB => [
    clamp8(fg[0] * fg[3] + bg[0] * (1 - fg[3])),
    clamp8(fg[1] * fg[3] + bg[1] * (1 - fg[3])),
    clamp8(fg[2] * fg[3] + bg[2] * (1 - fg[3])),
  ];
  const stopsOf = (bgImage: string): RGB[] => {
    if (!bgImage || bgImage === 'none') return [];
    const out: RGB[] = [];
    const re = /rgba?\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bgImage))) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && !p.slice(0, 3).some((n) => Number.isNaN(n))) out.push([p[0], p[1], p[2]]);
    }
    return out;
  };

  const selectorOf = (el: Element): string => {
    const tid = el.getAttribute('data-testid');
    if (tid) return `[data-testid="${tid}"]`;
    let s = el.tagName.toLowerCase();
    const cls = (typeof el.className === 'string' ? el.className : '')
      .split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    return txt ? `${s} "${txt.slice(0, 40)}"` : s;
  };

  const chainOf = (el: Element | null): Element[] => {
    const chain: Element[] = [];
    let n: Element | null = el;
    while (n) {
      chain.unshift(n);
      n = n.parentElement;
    }
    return chain;
  };

  const chainOpacity = (el: Element): number => {
    let op = 1;
    for (const a of chainOf(el)) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      op *= parseFloat(cs.opacity);
    }
    return op;
  };

  /**
   * Backgrounds a pixel inside `el` could take: compose ancestor background
   * colors from the root down (opaque layers reset), and where a gradient is
   * painted, every color stop is a separate candidate so callers can take the
   * worst one. A bitmap background image cannot be measured and is reported.
   */
  const bgOf = (el: Element | null): { base: string; candidates: string[]; bitmap: boolean } => {
    let base: RGB = [255, 255, 255];
    let candidates: RGB[] | null = null;
    let bitmap = false;
    for (const a of chainOf(el)) {
      const cs = getComputedStyle(a);
      const c = parse(cs.backgroundColor);
      const stops = stopsOf(cs.backgroundImage);
      if (cs.backgroundImage && cs.backgroundImage.includes('url(')) bitmap = true;
      if (c && c[3] >= 0.99) {
        base = [c[0], c[1], c[2]];
        candidates = stops.length ? stops.map((s) => over([s[0], s[1], s[2], 1], base)) : null;
      } else {
        if (c && c[3] > 0) base = over(c, base);
        if (stops.length) candidates = stops.map((s) => over(s, base));
      }
    }
    const list = candidates && candidates.length ? candidates : [base];
    return { base: hex(base), candidates: list.map(hex), bitmap };
  };

  const insideScroller = (el: Element): boolean => {
    let p: Element | null = el.parentElement;
    while (p) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };

  const clippedByScroller = (el: Element, r: DOMRect): boolean => {
    let p: Element | null = el.parentElement;
    while (p) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) return true;
      }
      p = p.parentElement;
    }
    return false;
  };

  const requiredFor = (cs: CSSStyleDeclaration): number => {
    const px = parseFloat(cs.fontSize);
    const weight = parseFloat(cs.fontWeight);
    return px >= 24 || (weight >= 700 && px >= 18.66) ? MIN_LARGE : MIN_TEXT;
  };

  const report: VisualReport = {
    pageBase: '#ffffff',
    pageCandidates: ['#ffffff'],
    textColor: '#111111',
    dark: false,
    text: [],
    coverage: [],
    tap: [],
    overflow: [],
    samples: [],
    doc: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
  };

  const rootBg = bgOf(document.documentElement);
  report.pageBase = rootBg.base;
  report.pageCandidates = rootBg.candidates;
  const textRgb = parse(getComputedStyle(document.body).color);
  report.textColor = textRgb ? hex([textRgb[0], textRgb[1], textRgb[2]]) : '#111111';
  report.dark = luminance(hexRgb(report.pageBase)) < 0.4;

  /* ---------- text contrast ---------- */
  if (opts.text) {
    const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'META', 'LINK']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      const text = (node.textContent ?? '').trim();
      if (!text || !el || skipTags.has(el.tagName)) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const alpha = chainOpacity(el);
      if (alpha < 0.05) continue;
      if (clippedByScroller(el, r)) continue;
      const cs = getComputedStyle(el);
      const fgParsed = parse(cs.color);
      if (!fgParsed) continue;
      const bg = bgOf(el);
      const required = requiredFor(cs);
      let worst = Infinity;
      let worstBg = bg.base;
      for (const candidate of bg.candidates) {
        const bgRgb = hexRgb(candidate);
        const fgRgb: RGB = alpha >= 0.999
          ? [fgParsed[0], fgParsed[1], fgParsed[2]]
          : over([fgParsed[0], fgParsed[1], fgParsed[2], alpha], bgRgb);
        const ratio = contrast(fgRgb, bgRgb);
        if (ratio < worst) {
          worst = ratio;
          worstBg = candidate;
        }
      }
      if (bg.bitmap && worst < required) {
        worst = 0;
        worstBg = 'bitmap background image';
      }
      if (worst < required) {
        report.text.push({
          selector: selectorOf(el),
          text: text.slice(0, 60),
          fg: hex([fgParsed[0], fgParsed[1], fgParsed[2]]),
          bg: worstBg,
          candidates: bg.candidates,
          ratio: Math.round(worst * 100) / 100,
          required,
          fontSize: parseFloat(cs.fontSize),
        });
      }
    }

    // Placeholder text of an empty, visible input is text the user must read.
    for (const inputEl of Array.from(document.querySelectorAll('input, textarea'))) {
      const input = inputEl as HTMLInputElement;
      if (input.type === 'hidden' || !input.placeholder) continue;
      if ((input.value ?? '') !== '') continue;
      const r = input.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (chainOpacity(input) < 0.05) continue;
      const cs = getComputedStyle(input, '::placeholder');
      const ph = parse(cs.color);
      if (!ph) continue;
      const bg = bgOf(input);
      let worst = Infinity;
      let worstBg = bg.base;
      for (const candidate of bg.candidates) {
        const ratio = contrast([ph[0], ph[1], ph[2]], hexRgb(candidate));
        if (ratio < worst) {
          worst = ratio;
          worstBg = candidate;
        }
      }
      if (worst < MIN_TEXT) {
        report.text.push({
          selector: selectorOf(input) + '::placeholder',
          text: input.placeholder.slice(0, 60),
          fg: hex([ph[0], ph[1], ph[2]]),
          bg: worstBg,
          candidates: bg.candidates,
          ratio: Math.round(worst * 100) / 100,
          required: MIN_TEXT,
          fontSize: parseFloat(cs.fontSize),
        });
      }
    }
  }

  /* ---------- background coverage ---------- */
  const sampleCoverage = (mode: string) => {
    const ih = window.innerHeight;
    const iw = window.innerWidth;
    document.documentElement.style.setProperty('scroll-behavior', 'auto');
    document.body.style.setProperty('scroll-behavior', 'auto');
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - ih);
    const target = mode === 'end' ? maxScroll : mode === 'middle' ? Math.round(maxScroll / 2) : 0;
    window.scrollTo(0, target);
    for (const y of [ih - 2, ih - 10]) {
      if (y < 1 || y > ih - 1) continue;
      for (const x of [Math.round(iw * 0.5), 8, iw - 8]) {
        const at = document.elementFromPoint(x, y);
        const bg = bgOf(at);
        report.samples.push({ where: `${mode}@${x}`, y: y + window.scrollY, bg: bg.base, candidates: bg.candidates });
        let textEl: Element | null = at;
        let hops = 0;
        while (textEl && hops < 5) {
          const direct = Array.from(textEl.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
          if (direct) break;
          textEl = textEl.parentElement;
          hops++;
        }
        const cs = textEl ? getComputedStyle(textEl) : getComputedStyle(document.body);
        const fgParsed = textEl ? parse(cs.color) : parse(getComputedStyle(document.body).color);
        const fgRgb: RGB = fgParsed ? [fgParsed[0], fgParsed[1], fgParsed[2]] : hexRgb(report.textColor);
        const required = requiredFor(cs);
        let worst = Infinity;
        let worstBg = bg.base;
        for (const candidate of bg.candidates) {
          const ratio = contrast(fgRgb, hexRgb(candidate));
          if (ratio < worst) {
            worst = ratio;
            worstBg = candidate;
          }
        }
        if (bg.bitmap && worst < required) {
          worst = 0;
          worstBg = 'bitmap background image';
        }
        if (worst < required) {
          report.coverage.push({
            where: `${mode} at (${x}, ${y + window.scrollY}) under ${at ? selectorOf(at) : 'html'}`,
            y: y + window.scrollY,
            fg: hex(fgRgb),
            bg: worstBg,
            ratio: Math.round(worst * 100) / 100,
            required,
          });
        }
      }
    }
  };
  for (const mode of opts.coverage ?? []) sampleCoverage(mode);

  /* ---------- tap targets ---------- */
  if (opts.tap) {
    const selector = [
      'button', '[role="button"]', 'input[type="submit"]', 'a[href]',
      '[data-testid="die"]', '[data-testid^="score-"]:not([data-testid="score-value"])',
    ].join(', ');
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (chainOpacity(el) < 0.05) continue;
      if (r.width < MIN_TAP || r.height < MIN_TAP) {
        report.tap.push({
          selector: selectorOf(el),
          text: (el.textContent ?? '').trim().slice(0, 40),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        });
      }
    }
  }

  /* ---------- horizontal overflow ---------- */
  if (opts.overflow) {
    const iw = window.innerWidth;
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (chainOpacity(el) < 0.05) continue;
      if (insideScroller(el)) continue;
      if (r.width > iw + 1) report.overflow.push({
        selector: selectorOf(el), w: Math.round(r.width * 10) / 10, iw,
      });
      if (report.overflow.length > 8) break;
    }
    if (document.documentElement.scrollWidth > iw + 1 || document.body.scrollWidth > iw + 1) {
      report.overflow.push({
        selector: 'html/body scrollWidth', w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), iw,
      });
    }
  }

  return report;
}
