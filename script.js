(function () {
  const siteNav = document.querySelector('.site-nav');
  const navToggleBtn = document.getElementById('navToggleBtn');
  const navMenu = document.getElementById('navMenu');
  const printBtn = document.getElementById('printBtn');
  const themeBtn = document.getElementById('themeBtn');

  const THEME_STORAGE_KEY = 'theme-preference';
  const THEMES = {
    dark: 'dark',
    light: 'light',
  };

  let currentTheme = null;

  function isDesktopNav() {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  }

  function setNavOpen(open) {
    if (!siteNav || !navToggleBtn) return;
    siteNav.dataset.open = open ? 'true' : 'false';
    navToggleBtn.setAttribute('aria-expanded', String(open));
  }

  if (siteNav && navToggleBtn) {
    setNavOpen(isDesktopNav());

    navToggleBtn.addEventListener('click', () => {
      if (isDesktopNav()) return;
      const nextOpen = siteNav.dataset.open !== 'true';
      setNavOpen(nextOpen);
    });

    if (navMenu) {
      navMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
          if (!isDesktopNav()) setNavOpen(false);
        });
      });
    }

    window.addEventListener('resize', () => {
      setNavOpen(isDesktopNav());
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', async () => {
      // 关键：打印快照通常不会等待异步渲染完成。
      // 这里先完成“打印态”准备（二维码/图表重绘），再触发 window.print()。
      const prevPrinting = document.documentElement.dataset.printing;
      try {
        document.documentElement.dataset.printing = '1';
        renderQRCodes();
        await renderMermaid(THEMES.light);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      } catch (e) {
        // ignore
      }

      window.print();

      // 兜底：部分浏览器在取消打印时不会触发 afterprint。
      try {
        if (prevPrinting) {
          document.documentElement.dataset.printing = prevPrinting;
        } else {
          delete document.documentElement.dataset.printing;
        }
        renderQRCodes();
        renderMermaid(currentTheme || THEMES.dark);
      } catch (e) {
        // ignore
      }
    });
  }

  function getCssVar(element, name) {
    if (!element) return '';
    return getComputedStyle(element).getPropertyValue(name).trim();
  }

  function parsePx(value, fallback) {
    const v = (value || '').trim();
    if (!v) return fallback;
    const n = Number.parseFloat(v.replace('px', ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function renderQRCodes() {
    const nodes = document.querySelectorAll('[data-qrcode]');
    if (!nodes.length) return;

    const QRCodeStylingCtor = window.QRCodeStyling;

    const isPrintMode =
      document.documentElement.dataset.printing === '1' ||
      (window.matchMedia && window.matchMedia('print').matches);

    nodes.forEach((node) => {
      const text = (node.getAttribute('data-qrcode') || '').trim();
      if (!text) return;

      node.innerHTML = '';

      if (!QRCodeStylingCtor) {
        node.textContent = text;
        return;
      }

      try {
        const configRoot = node.closest('.qr-card') || document.documentElement;

        const size = parsePx(node.dataset.qrSize || getCssVar(configRoot, '--qr-size'), 170);
        const foreground = (node.dataset.qrForeground || getCssVar(configRoot, '--qr-foreground') || '#0b0f17').trim();
        const background = (node.dataset.qrBackground || getCssVar(configRoot, '--qr-background') || '#e5e7eb').trim();
        const dotsType = (node.dataset.qrDots || getCssVar(configRoot, '--qr-dots') || 'rounded').trim();
        const cornersType = (node.dataset.qrCorners || getCssVar(configRoot, '--qr-corners') || 'extra-rounded').trim();

        const qr = new QRCodeStylingCtor({
          width: size,
          height: size,
          type: isPrintMode ? 'svg' : 'canvas',
          data: text,
          margin: 1,
          dotsOptions: {
            type: dotsType,
            color: foreground,
          },
          cornersSquareOptions: {
            type: cornersType,
            color: foreground,
          },
          cornersDotOptions: {
            type: 'dot',
            color: foreground,
          },
          backgroundOptions: {
            color: background,
          },
        });

        qr.append(node);
      } catch (e) {
        node.textContent = text;
      }
    });
  }

  function getInitialTheme() {
    try {
      const saved = (localStorage.getItem(THEME_STORAGE_KEY) || '').trim();
      if (saved === THEMES.dark || saved === THEMES.light) return saved;
    } catch (e) {
      // ignore
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEMES.dark;
    }

    return THEMES.light;
  }

  function themeToMermaidTheme(theme) {
    return theme === THEMES.dark ? 'dark' : 'default';
  }

  function updateThemeButton() {
    if (!themeBtn) return;
    const isDark = currentTheme === THEMES.dark;
    themeBtn.textContent = isDark ? '切换日间' : '切换夜间';
    themeBtn.setAttribute('aria-pressed', String(isDark));
  }

  function captureMermaidSource() {
    const blocks = document.querySelectorAll('pre.mermaid');
    blocks.forEach((pre) => {
      if (!pre.dataset.mmdSource) {
        pre.dataset.mmdSource = pre.textContent || '';
      }
    });
  }

  const mermaidPanZoomState = new WeakMap();

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function getMermaidSvgs() {
    return Array.from(document.querySelectorAll('pre.mermaid svg'));
  }

  function applyMermaidTransform(svg) {
    const state = mermaidPanZoomState.get(svg);
    if (!state) return;
    const { x, y, scale } = state;
    svg.style.transformOrigin = '0 0';
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function resetMermaidView(svg) {
    mermaidPanZoomState.set(svg, {
      x: 0,
      y: 0,
      scale: 1,
      dragging: false,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      activePointers: new Map(),
      pinchStartDist: 0,
      pinchStartScale: 1,
      pinchWorldX: 0,
      pinchWorldY: 0,
    });
    applyMermaidTransform(svg);
  }

  function enableMermaidPanZoom() {
    const svgs = getMermaidSvgs();
    svgs.forEach((svg) => {
      if (!(svg instanceof SVGElement)) return;
      if (svg.dataset.panzoomReady === '1') return;
      svg.dataset.panzoomReady = '1';

      if (!mermaidPanZoomState.has(svg)) {
        resetMermaidView(svg);
      }

      // Zoom with wheel
      svg.addEventListener(
        'wheel',
        (e) => {
          // Only zoom when the pointer is over the chart.
          e.preventDefault();

          const state = mermaidPanZoomState.get(svg) || { x: 0, y: 0, scale: 1 };
          const rect = svg.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;

          const prevScale = state.scale;
          const nextScale = clamp(prevScale * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 4);

          // Keep the point under cursor stable.
          const worldX = (px - state.x) / prevScale;
          const worldY = (py - state.y) / prevScale;
          state.scale = nextScale;
          state.x = px - worldX * nextScale;
          state.y = py - worldY * nextScale;

          mermaidPanZoomState.set(svg, state);
          applyMermaidTransform(svg);
        },
        { passive: false }
      );

      // Pan with drag
      svg.addEventListener('pointerdown', (e) => {
        // Mouse: only left button. Touch/pen: allow.
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const state = mermaidPanZoomState.get(svg) || { x: 0, y: 0, scale: 1 };
        if (!state.activePointers) state.activePointers = new Map();

        // Limit to 2 pointers for pinch.
        if (state.activePointers.size >= 2 && !state.activePointers.has(e.pointerId)) return;

        state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (state.activePointers.size === 1) {
          // Start pan
          state.dragging = true;
          state.startX = e.clientX;
          state.startY = e.clientY;
          state.originX = state.x;
          state.originY = state.y;
        } else if (state.activePointers.size === 2) {
          // Start pinch (also supports midpoint pan)
          state.dragging = false;
          const pts = Array.from(state.activePointers.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          state.pinchStartDist = Math.hypot(dx, dy) || 1;
          state.pinchStartScale = state.scale;

          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          state.pinchWorldX = (midX - state.x) / state.scale;
          state.pinchWorldY = (midY - state.y) / state.scale;
        }

        mermaidPanZoomState.set(svg, state);
        try {
          svg.setPointerCapture(e.pointerId);
        } catch (_) {
          // ignore
        }
      });

      svg.addEventListener('pointermove', (e) => {
        const state = mermaidPanZoomState.get(svg);
        if (!state || !state.activePointers || !state.activePointers.has(e.pointerId)) return;

        state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (state.activePointers.size === 1) {
          if (!state.dragging) return;
          state.x = state.originX + (e.clientX - state.startX);
          state.y = state.originY + (e.clientY - state.startY);
          mermaidPanZoomState.set(svg, state);
          applyMermaidTransform(svg);
          return;
        }

        if (state.activePointers.size === 2) {
          const pts = Array.from(state.activePointers.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy) || 1;
          const nextScale = clamp(state.pinchStartScale * (dist / (state.pinchStartDist || 1)), 0.5, 4);

          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;

          state.scale = nextScale;
          state.x = midX - state.pinchWorldX * nextScale;
          state.y = midY - state.pinchWorldY * nextScale;

          mermaidPanZoomState.set(svg, state);
          applyMermaidTransform(svg);
        }
      });

      const endDrag = (e) => {
        const state = mermaidPanZoomState.get(svg);
        if (!state) return;
        if (state.activePointers) {
          state.activePointers.delete(e.pointerId);
        }

        if (!state.activePointers || state.activePointers.size === 0) {
          state.dragging = false;
        } else if (state.activePointers.size === 1) {
          // Continue panning with the remaining pointer without forcing a lift.
          const p = Array.from(state.activePointers.values())[0];
          state.dragging = true;
          state.startX = p.x;
          state.startY = p.y;
          state.originX = state.x;
          state.originY = state.y;
        }

        mermaidPanZoomState.set(svg, state);
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch (_) {
          // ignore
        }
      };

      svg.addEventListener('pointerup', endDrag);
      svg.addEventListener('pointercancel', endDrag);
      svg.addEventListener('pointerleave', (e) => {
        // If capture is lost or mouse leaves without pointerup, stop dragging.
        const state = mermaidPanZoomState.get(svg);
        if (state && state.dragging && e.pointerType === 'mouse') endDrag(e);
      });

      // Reset
      svg.addEventListener('dblclick', () => {
        resetMermaidView(svg);
      });
    });
  }

  async function renderMermaid(theme) {
    if (!window.mermaid) return;

    try {
      captureMermaidSource();

      const blocks = document.querySelectorAll('pre.mermaid');
      blocks.forEach((pre) => {
        const src = pre.dataset.mmdSource;
        if (typeof src === 'string' && src.length) {
          pre.textContent = src;
        }

        // Mermaid 会用 data-processed 跳过已渲染节点；切换主题时需要清掉。
        pre.removeAttribute('data-processed');
      });

      const mermaidFontFamily = getCssVar(document.documentElement, '--app-font-family');
      window.mermaid.initialize({
        startOnLoad: false,
        theme: themeToMermaidTheme(theme),
        themeVariables: {
          fontFamily: mermaidFontFamily || undefined,
        },
      });

      await window.mermaid.run({ querySelector: 'pre.mermaid' });

      enableMermaidPanZoom();
    } catch (e) {
      // ignore
    }
  }

  function setTheme(theme, options) {
    const { persist = true, rerender = true } = options || {};
    if (theme !== THEMES.dark && theme !== THEMES.light) return;

    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    updateThemeButton();

    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (e) {
        // ignore
      }
    }

    if (rerender) {
      renderQRCodes();
      renderMermaid(theme);
    }
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = currentTheme === THEMES.dark ? THEMES.light : THEMES.dark;
      setTheme(next, { persist: true, rerender: true });
    });
  }

  window.addEventListener('beforeprint', () => {
    document.documentElement.dataset.printing = '1';
    renderQRCodes();
  });

  window.addEventListener('afterprint', () => {
    delete document.documentElement.dataset.printing;
    renderQRCodes();
    renderMermaid(currentTheme || THEMES.dark);
  });

  // 兼容：部分浏览器在打开打印预览时，beforeprint 触发时机不稳定。
  // 监听 print 媒体切换，尽早把二维码重绘成 SVG（更适合导出 PDF）。
  try {
    if (window.matchMedia) {
      const mql = window.matchMedia('print');
      const onChange = (e) => {
        if (e.matches) {
          document.documentElement.dataset.printing = '1';
          renderQRCodes();
        } else {
          delete document.documentElement.dataset.printing;
          renderQRCodes();
        }
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onChange);
      }
    }
  } catch (e) {
    // ignore
  }

  captureMermaidSource();
  setTheme(getInitialTheme(), { persist: false, rerender: true });
})();
