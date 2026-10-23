const pageNames = {
  overview: '总览',
  shelves: '货架',
  companies: '公司',
  comparison: '对标分析',
};

const linksContainer = document.querySelector('.navigation-links');
const links = Array.from(linksContainer.querySelectorAll('.nav-link'));
const more = document.querySelector('.navigation-more');
const moreLinks = document.querySelector('.more-links');
const header = document.querySelector('.topbar');
const brand = document.querySelector('.brand');

function activatePage() {
  const requested = window.location.hash.slice(1);
  const current = Object.hasOwn(pageNames, requested) ? requested : 'overview';
  if (requested !== current) {
    window.history.replaceState(null, '', `#${current}`);
  }
  for (const link of links) {
    if (link.dataset.page === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const page of document.querySelectorAll('.page')) {
    page.hidden = page.id !== current;
  }
  document.title = `${pageNames[current]} · 蚂蚁货架监测平台`;
  more.dataset.active = String(Boolean(moreLinks.querySelector('[aria-current="page"]')));
  more.open = false;
}

function fitNavigation() {
  for (const link of links) linksContainer.append(link);
  more.hidden = true;
  const style = getComputedStyle(header);
  const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - brand.getBoundingClientRect().width - parseFloat(style.columnGap);
  if (linksContainer.getBoundingClientRect().width > available) {
    more.hidden = false;
    for (const link of [...links].reverse()) {
      if (linksContainer.getBoundingClientRect().width + more.getBoundingClientRect().width <= available) break;
      moreLinks.prepend(link);
    }
  }
  more.dataset.active = String(Boolean(moreLinks.querySelector('[aria-current="page"]')));
}

document.addEventListener('click', (event) => {
  if (!more.contains(event.target)) more.open = false;
  if (event.target.closest('.nav-link')) more.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && more.open) {
    more.open = false;
    more.querySelector('summary').focus();
  }
});
window.addEventListener('hashchange', activatePage);
window.addEventListener('resize', fitNavigation);
activatePage();
fitNavigation();
document.fonts.ready.then(fitNavigation);
