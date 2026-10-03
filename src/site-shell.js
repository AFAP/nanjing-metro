'use strict';
(() => {
  const valid = value => value === 'paper' ? 'paper' : 'city';
  const apply = value => {
    document.documentElement.dataset.style = valid(value);
    const select = document.querySelector('#site-style');
    if (select) select.value = valid(value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'paper' ? '#faf9f6' : '#f7f8f7');
    window.dispatchEvent(new Event('metro:style-change'));
  };
  let initial = 'city';
  try { initial = valid(localStorage.getItem('metro-visual-style')); } catch {}
  apply(initial);
  document.addEventListener('DOMContentLoaded', () => {
    apply(initial);
    document.querySelector('#site-style')?.addEventListener('change', event => {
      const value = valid(event.target.value);
      try { localStorage.setItem('metro-visual-style', value); } catch {}
      apply(value);
    });
    window.addEventListener('storage', event => {
      if (event.key === 'metro-visual-style') apply(event.newValue);
    });

    const nav = document.querySelector('.site-header nav');
    if (!nav) return;
    const links = [...nav.querySelectorAll('[data-section]')];
    const activate = (id, kind) => {
      for (const link of links) {
        const active = link.dataset.section === id;
        link.classList.toggle('nav-active', active);
        if (active) link.setAttribute('aria-current', kind);
        else link.removeAttribute('aria-current');
      }
    };

    // Pages that are their own destination mark their own nav entry, whatever
    // section of the home page the visitor last looked at.
    const standalone = {'terrain.html': 'terrain', 'transfer.html': 'transfer', 'quiz.html': 'quiz', 'records.html': 'records', 'exits.html': 'exits'};
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (standalone[file]) { activate(standalone[file], 'page'); return; }

    // On the home page the nav follows the section currently in view.
    const ids = ['network', 'station-info', 'city'];
    const update = () => {
      const threshold = document.querySelector('.site-header').getBoundingClientRect().height + 100;
      let current = ids[0];
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= threshold) current = id;
      }
      activate(current, 'location');
    };
    let pending = false;
    window.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; update(); });
    }, {passive: true});
    window.addEventListener('hashchange', update);
    update();
  });
})();
