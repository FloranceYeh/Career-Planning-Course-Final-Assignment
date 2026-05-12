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
