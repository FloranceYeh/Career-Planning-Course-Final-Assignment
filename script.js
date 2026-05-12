(function () {
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
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
          type: 'canvas',
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

  // Mermaid 图表：本页面使用本地 vendor/mermaid.min.js。
  if (window.mermaid) {
    try {
      const mermaidFontFamily = getCssVar(document.documentElement, '--app-font-family');
      window.mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        themeVariables: {
          fontFamily: mermaidFontFamily || undefined,
        },
      });
    } catch (e) {
      // ignore
    }
  }

  renderQRCodes();
})();
