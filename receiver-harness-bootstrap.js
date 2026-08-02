(async () => {
  const response = await fetch('index.html', {cache: 'no-store'});
  if (!response.ok) {
    throw new Error(`Cannot load receiver page: ${response.status}`);
  }

  const source = await response.text();
  const receiverDocument = new DOMParser().parseFromString(source, 'text/html');
  receiverDocument.querySelectorAll('style').forEach(sourceStyle => {
    const style = document.createElement('style');
    style.textContent = sourceStyle.textContent;
    document.head.append(style);
  });
  document.body.innerHTML = receiverDocument.body.innerHTML;

  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });

  await loadScript('receiver-harness-runtime.js');
  await loadScript('receiver.js');
  window.SweetCastHarness.installPanel();
})();
