(function () {
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Mermaid 图表：本地打开 HTML 时会从 CDN 加载 mermaid.min.js。
  // 若处于离线环境，图表不会渲染，但页面仍可正常阅读。
  if (window.mermaid) {
    try {
      window.mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
      });
    } catch (e) {
      // ignore
    }
  }
})();
