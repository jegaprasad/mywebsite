(() => {
  const C = window.JP_CONFIG;
  const $ = s => document.querySelector(s);
  const page = document.body.dataset.page;
  const NC = C.NEXTCLOUD_URL.replace(/\/$/, '');
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const getSession = () => { try { return JSON.parse(sessionStorage.getItem('jp')); } catch { return null; } };
  const dav = (user, path) => NC + '/remote.php/dav/files/' + encodeURIComponent(user) + '/' + enc(path);
  const BODY = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>';
  const propfind = (s, path, depth) => fetch(dav(s.u, path), {
    method: 'PROPFIND', headers: { Authorization: 'Basic ' + s.t, Depth: depth, 'Content-Type': 'application/xml' }, body: BODY
  });

  /* ---------- Front page ---------- */
  if (page === 'login') {
    const wall = $('#wall');
    C.POSTERS.forEach(f => {
      const d = document.createElement('div'); d.className = 'poster';
      const i = new Image(); i.alt = ''; i.loading = 'lazy'; i.src = 'posters/' + f;
      i.onerror = () => { i.remove(); d.classList.add('blank'); };
      d.append(i); wall.append(d);
    });
    const err = $('#err');
    $('#login').addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const u = $('#u').value.trim(), p = $('#p').value;
      const s = { u, t: b64(u + ':' + p) };
      const btn = e.submitter; btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const r = await propfind(s, '', '0');
        if (r.status === 207) { sessionStorage.setItem('jp', JSON.stringify(s)); location.href = 'files.html'; return; }
        err.textContent = r.status === 401 ? 'Wrong username or password.' : 'Nextcloud answered with error ' + r.status + '.';
      } catch {
        err.textContent = 'Cannot reach Nextcloud. Check that it is running, that the address in config.js is right, and that this site is allowed in its CORS settings.';
      }
      err.hidden = false; btn.disabled = false; btn.textContent = 'Log in';
    });
  }

  /* ---------- Files page ---------- */
  if (page === 'files') {
    const S = getSession();
    if (!S) { location.replace('index.html'); return; }
    const logout = () => { sessionStorage.removeItem('jp'); location.replace('index.html'); };
    $('#logout').onclick = logout;
    let cur = '', items = [];

    const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
    const ext = n => (n.split('.').pop() || '').toLowerCase();
    const IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp'], VID = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'];
    const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 3500); };
    const ncLink = () => NC + '/index.php/apps/files/?dir=' + encodeURIComponent('/' + cur);

    async function load() {
      cur = decodeURIComponent(location.hash.slice(1)).replace(/^\/+|\/+$/g, '');
      $('#nc').href = ncLink();
      let r;
      try { r = await propfind(S, cur, '1'); } catch { toast('Cannot reach Nextcloud.'); return; }
      if (r.status === 401) return logout();
      if (r.status !== 207) { toast('Cannot open this folder (error ' + r.status + ').'); return; }
      const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
      const g = (el, n) => el.getElementsByTagNameNS('DAV:', n)[0];
      items = [...doc.getElementsByTagNameNS('DAV:', 'response')].map(el => {
        const rel = decodeURIComponent(g(el, 'href').textContent.split('/remote.php/dav/files/')[1]).split('/').slice(1).join('/').replace(/\/$/, '');
        const len = g(el, 'getcontentlength'), mod = g(el, 'getlastmodified');
        return { rel, name: rel.split('/').pop(), dir: el.getElementsByTagNameNS('DAV:', 'collection').length > 0,
                 size: len ? +len.textContent : 0, mod: mod ? new Date(mod.textContent) : null };
      }).filter(i => i.rel !== cur)
        .sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name, undefined, { numeric: true }));
      render();
    }

    function render() {
      const crumbs = $('#crumbs'); crumbs.textContent = '';
      const parts = cur ? cur.split('/') : [];
      [['All files', '']].concat(parts.map((p, i) => [p, parts.slice(0, i + 1).join('/')])).forEach(([label, path], i, a) => {
        const el = i === a.length - 1 ? document.createElement('strong') : document.createElement('a');
        el.textContent = label; if (el.tagName === 'A') el.href = '#' + encodeURIComponent(path).replace(/%2F/g, '/');
        crumbs.append(el);
        if (i < a.length - 1) crumbs.append(' / ');
      });
      const list = $('#list'); list.textContent = '';
      $('#empty').hidden = items.length > 0; $('#all').checked = false;
      items.forEach((it, idx) => {
        const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'row');
        const c = document.createElement('label'); c.className = 'chk';
        if (!it.dir) { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.i = idx; cb.setAttribute('aria-label', 'Select ' + it.name); c.append(cb); }
        const name = document.createElement(it.dir ? 'a' : 'button'); name.className = 'name ' + (it.dir ? 'dir' : 'file');
        name.textContent = it.name;
        if (it.dir) name.href = '#' + enc(it.rel); else { name.type = 'button'; name.onclick = () => openFile(it); }
        const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = it.dir ? 'folder' : ext(it.name).slice(0, 4) || 'file';
        const nm = document.createElement('span'); nm.className = 'nm'; nm.append(badge, name);
        const sz = document.createElement('span'); sz.className = 'num'; sz.textContent = it.dir ? '' : fmtSize(it.size);
        const wh = document.createElement('span'); wh.className = 'when'; wh.textContent = it.mod ? it.mod.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        row.append(c, nm, sz, wh); list.append(row);
      });
    }

    async function fetchBlob(it) {
      const r = await fetch(dav(S.u, it.rel), { headers: { Authorization: 'Basic ' + S.t } });
      if (!r.ok) throw new Error(r.status);
      return r.blob();
    }
    async function download(it) {
      if (it.size > C.MAX_PAGE_DOWNLOAD_MB * 1048576) {
        toast(it.name + ' is large. Opening Nextcloud to download it.');
        window.open(NC + '/index.php/apps/files/?dir=' + encodeURIComponent('/' + cur), '_blank'); return;
      }
      const url = URL.createObjectURL(await fetchBlob(it));
      const a = document.createElement('a'); a.href = url; a.download = it.name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    async function openFile(it) {
      const e = ext(it.name);
      try {
        if (IMG.includes(e) && it.size < 25 * 1048576) {
          $('#vimg').src = URL.createObjectURL(await fetchBlob(it)); $('#viewer').showModal();
        } else if (VID.includes(e)) {
          toast('Opening Nextcloud to play this video.'); window.open(ncLink(), '_blank');
        } else await download(it);
      } catch { toast('Could not open ' + it.name + '.'); }
    }
    $('#vclose').onclick = () => $('#viewer').close();

    $('#all').onchange = e => document.querySelectorAll('#list input[type=checkbox]').forEach(c => c.checked = e.target.checked);
    $('#export').onclick = async () => {
      const picked = [...document.querySelectorAll('#list input:checked')].map(c => items[+c.dataset.i]);
      if (!picked.length) { toast('Tick the files you want to export first.'); return; }
      for (const it of picked) { try { await download(it); } catch { toast('Could not export ' + it.name + '.'); } }
    };

    /* Import */
    const prog = $('#progress');
    function upload(file) {
      return new Promise(done => {
        const li = document.createElement('li'); const bar = document.createElement('i'); const lb = document.createElement('span');
        lb.textContent = file.name; li.append(lb, bar); prog.append(li);
        const x = new XMLHttpRequest();
        x.open('PUT', dav(S.u, (cur ? cur + '/' : '') + file.name));
        x.setRequestHeader('Authorization', 'Basic ' + S.t);
        x.upload.onprogress = e => { if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100) + '%'; };
        x.onload = () => { const ok = x.status < 300; li.classList.add(ok ? 'ok' : 'bad'); lb.textContent = file.name + (ok ? ' imported' : ' failed (error ' + x.status + ')'); done(ok); };
        x.onerror = () => { li.classList.add('bad'); lb.textContent = file.name + ' failed'; done(false); };
        x.send(file);
      });
    }
    async function importFiles(files) {
      files = [...files].filter(f => f.size > 0 || f.type);
      if (!files.length) return;
      for (const f of files) await upload(f);
      await load(); setTimeout(() => prog.textContent = '', 6000);
    }
    $('#import').onclick = () => $('#picker').click();
    $('#picker').onchange = e => { importFiles(e.target.files); e.target.value = ''; };
    const drop = $('#drop'); let depth = 0;
    addEventListener('dragenter', e => { e.preventDefault(); depth++; drop.hidden = false; });
    addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
    addEventListener('dragover', e => e.preventDefault());
    addEventListener('drop', e => { e.preventDefault(); depth = 0; drop.hidden = true; importFiles(e.dataTransfer.files); });

    addEventListener('hashchange', load);
    load();
  }
})();
