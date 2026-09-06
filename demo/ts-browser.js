// https://github.com/harrysolovay/ts-browser
// and
// https://github.com/xitu/inline-module
// and
// https://glitch.com/edit/#!/typescript-in-browser?path=service-worker.js%3A15%3A0
// mooshed together until they worked.

const tsTranspiledEvent = new Event('tsTranspiled');

function createBlob(code, type = 'text/plain') {
  const blob = new Blob([code], {type});
  const blobURL = URL.createObjectURL(blob);
  return blobURL;
}

window.addEventListener('DOMContentLoaded', async () => {
  const scripts = document.getElementsByTagName('script');

  // Register the Service Worker which will polyfill the HTML module behavior.
  //
  // Prefer the widest scope we're allowed. The import map reaches outside this
  // directory (../src/...), and a worker registered at its own default scope of
  // ./ cannot intercept those requests, so the browser would try to execute the
  // raw .ts and refuse it for having a non-JavaScript MIME type. Root scope
  // needs the server to send `Service-Worker-Allowed: /`; when it doesn't, that
  // registration throws and we fall back to the default scope.
  try {
    await navigator.serviceWorker.register('./demo-sw.js', { scope: '/' });
  } catch {
    await navigator.serviceWorker.register('./demo-sw.js');
  }

  // Unfortunately, we have to wait for the Service Worker to ready before
  // actually loading the application so that it can intercept the HTML requests.
  await navigator.serviceWorker.ready.then(async worker => {

    // Next up is to compile the inline typescript present on the page.
    // Pick up their contents, yeet them at the compiler, and then load the result as a URL blob
    // so that modules will load properly.
    //
    // These are done strictly one at a time. The worker's reply carries no id
    // saying which script it belongs to, and it compiles asynchronously, so
    // replies can come back in a different order than the requests went out.
    // Posting everything up front and pairing replies positionally would then
    // execute the wrong blob. Waiting for each reply in turn is slower but is
    // the only ordering we can actually rely on.
    const tsScripts = Array.from(scripts).filter(s => s.type === 'text/typescript');
    for (let i = 0; i < tsScripts.length; i++) {
      const transpiled = await new Promise(resolve => {
        const onMessage = ({ data }) => {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve(data);
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.active.postMessage([`Inline script tag ${i}`, tsScripts[i].innerHTML]);
      });

      // In order for the browser to treat this as the es6 module it is
      // we must trick it into 'loading' it. We encode it into a blob URL
      // and then 'import' that.

      // TODO: Post it externally and then load it inline so it looks more normal?
      const scriptAsBlob = createBlob(transpiled, 'text/javascript');
      await import(scriptAsBlob);
    }

    window.dispatchEvent(tsTranspiledEvent);
  });
});
