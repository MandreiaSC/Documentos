// Guarda o aplicativo no aparelho para funcionar sem internet. Nenhum dado de paciente passa por aqui.
const VERSAO = 'documentos-v1';
const ARQUIVOS = ['./', 'index.html', 'gerar_pdf.js', 'pdf-lib.min.js', 'assinatura.json',
  'fundo_encaminhamento.png', 'fundo_atestado.png', 'fundo_declaracao.png', 'fundo_receituario.png',
  'manifest.webmanifest', 'icone_180.png', 'icone_192.png', 'icone_512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// com internet: busca a versão nova e guarda; sem internet: usa a guardada
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
