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
    const terrain = location.pathname.endsWith('/terrain.html');
    const activate = id => {
      for (const link of nav.querySelectorAll('[data-section]')) {
        const active = link.dataset.section === id;
        link.classList.toggle('nav-active', active);
        if (active) link.setAttribute('aria-current', terrain ? 'page' : 'location');
        else link.removeAttribute('aria-current');
      }
    };
    if (terrain) return activate('terrain');
    const ids = ['network', 'station-info', 'city', 'guide'];
    const update = () => {
      const threshold = document.querySelector('.site-header').getBoundingClientRect().height + 100;
      let current = ids[0];
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= threshold) current = id;
      }
      activate(current);
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
