// Monta os 4 documentos avulsos (Encaminhamento, Atestado, Declaração, Receituário) com o mesmo visual,
// textos e posições do SGO_RA, e tranca o PDF contra edição
// (padrão do PDF, revisão 4, AES-128; senha de edição sorteada na hora e descartada).
// Tudo acontece dentro do aparelho: nenhum dado sai daqui.
// © 2026 Marcia Sales. Todos os direitos reservados.
(function () {
  const { PDFDocument, StandardFonts, rgb, PDFNumber, PDFString, PDFHexString, PDFDict, PDFArray, PDFRawStream } = PDFLib;
  const W = 595.28, H = 841.89, preto = rgb(0, 0, 0);
  const X = W * 0.10, LARG = W * 0.80, TAM = 12, ENTRE = 18;

  // ---------- texto ----------
  function limpar(font, t) {
    let s = '';
    for (const ch of String(t || '').replace(/\r/g, '').replace(/\t/g, ' ')) {
      if (ch === '\n') { s += ch; continue; }
      try { font.widthOfTextAtSize(ch, TAM); s += ch; } catch { s += '?'; }
    }
    return s;
  }
  // quebra em linhas; "fim" marca a última linha do parágrafo (essa não é justificada)
  function quebrar(texto, font, tam, larg) {
    const linhas = [];
    for (const par of texto.split('\n')) {
      if (!par.trim()) { linhas.push({ t: '', fim: true }); continue; }
      let atual = '';
      for (const palavra of par.trim().split(/ +/)) {
        const teste = atual ? atual + ' ' + palavra : palavra;
        if (font.widthOfTextAtSize(teste, tam) <= larg) { atual = teste; continue; }
        if (atual) linhas.push({ t: atual, fim: false });
        let p = palavra; // palavra maior que a linha: corta
        while (font.widthOfTextAtSize(p, tam) > larg) {
          let n = p.length; while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), tam) > larg) n--;
          linhas.push({ t: p.slice(0, n), fim: false }); p = p.slice(n);
        }
        atual = p;
      }
      linhas.push({ t: atual, fim: true });
    }
    return linhas;
  }

  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const extenso = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
  const br = (iso) => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };

  // cada documento: fundo, se o rodapé já vem na imagem, onde o texto começa e o que vai escrito
  const MODELOS = {
    encaminhamento: { fundo: 'fundo_encaminhamento.png', rodapeNaImagem: false, titulo: 'Encaminhamento' },
    atestado:       { fundo: 'fundo_atestado.png',       rodapeNaImagem: true,  titulo: 'Atestado fisioterapêutico' },
    declaracao:     { fundo: 'fundo_declaracao.png',     rodapeNaImagem: true,  titulo: 'Declaração de comparecimento' },
    receituario:    { fundo: 'fundo_receituario.png',    rodapeNaImagem: false, titulo: 'Receituário' },
  };

  async function montar(tipo, d, assinaturaPng) {
    const M = MODELOS[tipo];
    const pdf = await PDFDocument.create();
    pdf.setTitle(M.titulo + (d.nome ? ' — ' + d.nome : ''));
    pdf.setAuthor('RA Fisioterapia e Osteopatia Ltda.');
    pdf.setLanguage('pt-BR');
    const times = await pdf.embedFont(StandardFonts.TimesRoman);
    const timesB = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const fundo = await pdf.embedPng(await (await fetch(M.fundo)).arrayBuffer());
    const assin = await pdf.embedPng(assinaturaPng);
    const LIMITE = M.rodapeNaImagem ? 780 : 770;   // nada passa do rodapé

    let pg, y;
    const novaPagina = (topo) => {
      pg = pdf.addPage([W, H]);
      pg.drawImage(fundo, { x: 0, y: 0, width: W, height: H });
      if (!M.rodapeNaImagem) {
        pg.drawRectangle({ x: 0, y: 0, width: W, height: H - 785, color: rgb(0xcc / 255, 0xdf / 255, 0xdb / 255) });
        const rod = (t, yy) => pg.drawText(t, { x: (W - times.widthOfTextAtSize(t, 10)) / 2, y: H - yy, size: 10, font: times, color: preto });
        rod('RA FISIOTERAPIA E OSTEOPATIA LTDA — CNPJ 50.473.333/0001-06', 798);
        rod('Rua Visconde de Pirajá, 82 – sala 803 – Ipanema – Rio de Janeiro/RJ – CEP: 22410-000', 812);
      }
      y = topo;
    };
    const escrever = (t, x, base, f = times, tam = TAM) => pg.drawText(t, { x, y: H - base, size: tam, font: f, color: preto });
    const centro = (t, base, f = times, tam = TAM) => escrever(t, (W - f.widthOfTextAtSize(t, tam)) / 2, base, f, tam);
    const garantir = (altura) => { if (y + altura > LIMITE) novaPagina(175); };
    // texto justificado, como no SGO_RA (a última linha de cada parágrafo fica à esquerda)
    const corpo = (texto) => {
      for (const l of quebrar(limpar(times, texto), times, TAM, LARG)) {
        garantir(ENTRE);
        const palavras = l.t.split(' ');
        if (l.t && !l.fim && palavras.length > 1) {
          const ocupado = palavras.reduce((s, p) => s + times.widthOfTextAtSize(p, TAM), 0);
          const vao = (LARG - ocupado) / (palavras.length - 1);
          let x = X; for (const p of palavras) { escrever(p, x, y + 12); x += times.widthOfTextAtSize(p, TAM) + vao; }
        } else if (l.t) escrever(l.t, X, y + 12);
        y += ENTRE;
      }
    };
    const assinatura = () => {
      const aL = 112.5, aA = aL * 146 / 340;
      garantir(33 + 18 + aA + 44);   // data e assinatura sempre juntas
      y += 33;
      centro(limpar(times, 'Rio de Janeiro, ' + extenso(d.dataDoc)), y + 12); y += 18;
      pg.drawImage(assin, { x: (W - aL) / 2, y: H - (y + aA), width: aL, height: aA }); y += aA;
      centro('Dra. Raquel Abrantes Quintella', y + 12, timesB); y += 14;
      centro('Fisioterapeuta e Osteopata', y + 12); y += 14;
      centro('Crefito 2: 57198-F', y + 12);
    };

    if (tipo === 'encaminhamento') {
      novaPagina(267.7);
      const campo = (rot, val, x, base) => { escrever(rot, x, base, timesB); escrever(limpar(times, val), x + timesB.widthOfTextAtSize(rot + ' ', TAM), base); };
      campo('Nome:', d.nome, 41, 206);
      campo('Sexo:', d.sexo, 396.5, 206);
      campo('Nascimento:', d.nascimento, 41, 232);
      campo('CPF:', d.cpf, 189.3, 232);
      for (const [titulo, texto] of [['EVOLUÇÃO', d.evolucao], ['ENCAMINHAMENTO', d.encaminhamento]]) {
        garantir(19.5 + 12 + 12 + ENTRE);          // título nunca fica sozinho
        y += 19.5; centro(titulo, y + 10, timesB); y += 12 + 12;
        corpo(texto);
      }
    } else if (tipo === 'atestado' || tipo === 'declaracao') {
      const texto = tipo === 'atestado'
        ? `Atesto para os devidos fins, que ${d.nome || ''}, portador(a) do RG nº ${d.rg || ''} e CPF nº ${d.cpf || ''}, esteve sob os meus cuidados no dia ${d.data ? br(d.data) : '____/____/________'}, e necessita de ${d.dias ? String(d.dias).padStart(2, '0') : '__'} dia(s) de afastamento de suas atividades laborais e/ou escolares.`
        : `Declaro para os devidos fins, que ${d.nome || ''}, portador(a) do RG nº ${d.rg || ''} e CPF nº ${d.cpf || ''}, compareceu ao meu consultório no dia ${d.data ? br(d.data) : '____/____/________'}, no intervalo de horário de ${d.horaIni || '__:__'}h às ${d.horaFim || '__:__'}h, para fins de tratamento de fisioterapia e osteopatia.`;
      novaPagina(204.6);
      // título sublinhado (18,7 px = 14 pt), como no SGO_RA
      const tam = 14, larg = timesB.widthOfTextAtSize(M.titulo, tam), xt = (W - larg) / 2;
      y += 19.5; escrever(M.titulo, xt, y + 12, timesB, tam);
      pg.drawLine({ start: { x: xt, y: H - (y + 14) }, end: { x: xt + larg, y: H - (y + 14) }, thickness: 0.8, color: preto });
      y += 14 + 30;
      corpo(texto);
    } else if (tipo === 'receituario') {
      novaPagina(139);
      corpo(d.texto);
    }
    assinatura();
    return pdf.save({ useObjectStreams: false });
  }

  // ---------- proteção ----------
  const PAD = new Uint8Array([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
  const juntar = (...partes) => { const n = partes.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of partes) { o.set(p, i); i += p.length; } return o; };
  function md5(bytes) {
    const K = new Uint32Array(64), S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const len = bytes.length, total = (((len + 8) >>> 6) + 1) * 64, m = new Uint8Array(total);
    m.set(bytes); m[len] = 0x80;
    const bits = len * 8; for (let i = 0; i < 8; i++) m[total - 8 + i] = Math.floor(bits / Math.pow(2, 8 * i)) & 255;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const Mw = new Uint32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) Mw[i] = m[off + i * 4] | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + Mw[g]) >>> 0; A = D; D = C; C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const o = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) o[i * 4 + j] = (v >>> (8 * j)) & 255; });
    return o;
  }
  function rc4(key, data) {
    const S = new Uint8Array(256); for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0; for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; }
    const o = new Uint8Array(data.length); let i = 0; j = 0;
    for (let k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; const t = S[i]; S[i] = S[j]; S[j] = t; o[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
    return o;
  }
  const xorK = (k, n) => k.map((b) => b ^ n);
  // imprimir (4), preencher (256), acessibilidade (512), impressão boa (2048); sem alterar, copiar, comentar, montar
  const PERM = (0xFFFFF000 | 0xC0 | 4 | 256 | 512 | 2048) | 0;
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

  async function proteger(bytes) {
    const senha = crypto.getRandomValues(new Uint8Array(32)); // senha de edição sorteada e descartada
    const id = crypto.getRandomValues(new Uint8Array(16));
    let h = md5(senha); for (let i = 0; i < 50; i++) h = md5(h);
    const kO = h.slice(0, 16);
    let O = rc4(kO, PAD); for (let i = 1; i <= 19; i++) O = rc4(xorK(kO, i), O);
    const p = new Uint8Array(4); new DataView(p.buffer).setInt32(0, PERM, true);
    let k = md5(juntar(PAD, O, p, id)); for (let i = 0; i < 50; i++) k = md5(k.slice(0, 16));
    const KEY = k.slice(0, 16);
    let U = rc4(KEY, md5(juntar(PAD, id))); for (let i = 1; i <= 19; i++) U = rc4(xorK(KEY, i), U);
    U = juntar(U, crypto.getRandomValues(new Uint8Array(16)));

    const cifrar = async (num, gen, dados) => {
      const ck = md5(juntar(KEY, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), new TextEncoder().encode('sAlT')));
      const iv = crypto.getRandomValues(new Uint8Array(16));
      const chave = await crypto.subtle.importKey('raw', ck, 'AES-CBC', false, ['encrypt']);
      return juntar(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, chave, dados)));
    };
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = pdf.context;
    const cifrarValor = async (v, num, gen) => {
      if (v instanceof PDFString || v instanceof PDFHexString) return PDFHexString.of(hex(await cifrar(num, gen, v.asBytes())));
      if (v instanceof PDFDict) { for (const [kk, vv] of v.entries()) v.set(kk, await cifrarValor(vv, num, gen)); return v; }
      if (v instanceof PDFArray) { for (let i = 0; i < v.size(); i++) v.set(i, await cifrarValor(v.get(i), num, gen)); return v; }
      return v;
    };
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      const num = ref.objectNumber, gen = ref.generationNumber;
      if (obj instanceof PDFRawStream) {
        await cifrarValor(obj.dict, num, gen);
        ctx.assign(ref, PDFRawStream.of(obj.dict, await cifrar(num, gen, obj.contents)));
      } else await cifrarValor(obj, num, gen);
    }
    const cf = ctx.obj({ StdCF: ctx.obj({ CFM: 'AESV2', AuthEvent: 'DocOpen', Length: 16 }) });
    const enc = ctx.obj({ Filter: 'Standard', V: 4, R: 4, Length: 128, CF: cf, StmF: 'StdCF', StrF: 'StdCF',
      O: PDFHexString.of(hex(O)), U: PDFHexString.of(hex(U)), P: PDFNumber.of(PERM) });
    ctx.trailerInfo.Encrypt = ctx.register(enc);
    ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(hex(id)), PDFHexString.of(hex(id))]);
    return pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
  }

  window.gerarDocumentoPDF = async (tipo, dados, assinaturaPng) => proteger(await montar(tipo, dados, assinaturaPng));
  window.MODELOS_DOCUMENTOS = MODELOS;
})();
