/**
 * Preview click-to-edit inspector — injected into published HTML.
 * Activates only with ?ib_edit=1 (Builder iframe). Feeds the existing chat pipeline.
 * Not an agent tool. Not a visual editor.
 */

export const PREVIEW_SELECT_EVENT = 'indobase:preview-select'
export const PREVIEW_INSPECTOR_MARK = 'data-ib-inspector'

export type PreviewTargetType = 'section' | 'block' | 'product' | 'image' | 'text'

export type PreviewTarget = {
  type: PreviewTargetType
  id: string
  component: string
  label: string
  source: 'preview'
  text?: string
}

export type PreviewIntent =
  | 'modify_copy'
  | 'change_image'
  | 'make_premium'
  | 'duplicate'
  | 'hide'
  | 'move'
  | 'delete'
  | 'edit'

const INSPECTOR_FLAG = 'ib-preview-inspector-v1'

export function injectPreviewInspector(html: string): string {
  if (!html || typeof html !== 'string') return html
  if (html.includes(INSPECTOR_FLAG) || html.includes(PREVIEW_INSPECTOR_MARK)) return html
  const tag = `<script ${PREVIEW_INSPECTOR_MARK}="1">${previewInspectorRuntime()}</script>`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`)
  return `${html}\n${tag}`
}

export function previewInspectorRuntime(): string {
  return `/* ${INSPECTOR_FLAG} */
(function(){
  try {
    if (!/(?:^|[?&])ib_edit=1(?:&|$)/.test(location.search)) return;
    if (window.__IB_PREVIEW_INSPECTOR__) return;
    window.__IB_PREVIEW_INSPECTOR__ = true;
    var css = document.createElement('style');
    css.textContent = '[data-ib-section]{cursor:pointer;position:relative;transition:outline .12s ease,box-shadow .12s ease}[data-ib-section].ib-hover{outline:2px dashed rgba(59,143,214,.85);outline-offset:3px}[data-ib-section].ib-selected{outline:2px solid #3B8FD6;outline-offset:3px;box-shadow:0 0 0 6px rgba(59,143,214,.18)}[data-ib-section].ib-selected::after{content:attr(data-ib-label);position:absolute;top:0;left:0;transform:translateY(-110%);background:#3B8FD6;color:#fff;font:650 11px/1.2 system-ui,sans-serif;padding:3px 7px;border-radius:6px;z-index:2147483646;pointer-events:none}';
    document.head.appendChild(css);
    function labelOf(el){
      var explicit = el.getAttribute('data-ib-label');
      if (explicit) return explicit;
      var id = (el.id || el.getAttribute('data-ib-section') || el.tagName || 'section').toLowerCase();
      if (id === 'header' || id === 'hero' || id === 'banner') return 'Hero';
      if (id === 'footer') return 'Footer';
      if (id === 'products' || id === 'grid' || id === 'catalog') return 'Products';
      if (id === 'cart' || id === 'checkout') return 'Checkout';
      var h = el.querySelector && el.querySelector('h1,h2');
      if (h && h.textContent) return String(h.textContent).trim().slice(0,40) || 'Section';
      return id.charAt(0).toUpperCase() + id.slice(1);
    }
    function mark(el, id, component, type){
      if (!el || el.getAttribute('data-ib-section')) return;
      el.setAttribute('data-ib-section', id);
      el.setAttribute('data-ib-component', component);
      el.setAttribute('data-ib-type', type || 'section');
      el.setAttribute('data-ib-label', labelOf(el));
    }
    var header = document.querySelector('header,[role="banner"]');
    if (header) mark(header, header.id || 'hero', 'Hero', 'section');
    var main = document.querySelector('main');
    if (main) mark(main, main.id || 'main', 'Main', 'section');
    var footer = document.querySelector('footer');
    if (footer) mark(footer, footer.id || 'footer', 'Footer', 'section');
    document.querySelectorAll('section,[data-ib-section]').forEach(function(el, i){
      var id = el.id || el.getAttribute('data-ib-section') || ('section-' + (i+1));
      mark(el, id, el.getAttribute('data-ib-component') || 'Section', 'section');
    });
    document.querySelectorAll('article.card, .card, [data-product-id]').forEach(function(el, i){
      if (el.closest('header')) return;
      mark(el, el.getAttribute('data-id') || el.getAttribute('data-product-id') || ('product-' + (i+1)), 'Product', 'product');
    });
    var selected = null;
    function clearHover(){
      document.querySelectorAll('[data-ib-section].ib-hover').forEach(function(n){ n.classList.remove('ib-hover'); });
    }
    function targetFrom(el){
      var node = el && el.closest ? el.closest('[data-ib-section]') : null;
      if (!node) return null;
      var text = '';
      var h = node.querySelector && node.querySelector('h1,h2,p');
      if (h && h.textContent) text = String(h.textContent).trim().slice(0, 120);
      return {
        type: node.getAttribute('data-ib-type') || 'section',
        id: node.getAttribute('data-ib-section') || 'section',
        component: node.getAttribute('data-ib-component') || 'Section',
        label: node.getAttribute('data-ib-label') || labelOf(node),
        source: 'preview',
        text: text
      };
    }
    document.addEventListener('mouseover', function(ev){
      var t = ev.target && ev.target.closest && ev.target.closest('[data-ib-section]');
      clearHover();
      if (t && t !== selected) t.classList.add('ib-hover');
    }, true);
    document.addEventListener('mouseout', function(ev){
      if (!ev.relatedTarget || !ev.currentTarget.contains(ev.relatedTarget)) clearHover();
    }, true);
    document.addEventListener('click', function(ev){
      if (ev.target && ev.target.closest && ev.target.closest('input,textarea,select,dialog,a[href]')) return;
      var node = ev.target && ev.target.closest && ev.target.closest('[data-ib-section]');
      if (!node) return;
      ev.preventDefault();
      ev.stopPropagation();
      document.querySelectorAll('[data-ib-section].ib-selected').forEach(function(n){ n.classList.remove('ib-selected'); });
      node.classList.remove('ib-hover');
      node.classList.add('ib-selected');
      selected = node;
      var r = node.getBoundingClientRect();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: '${PREVIEW_SELECT_EVENT}',
          target: targetFrom(node),
          rect: { top: r.top, left: r.left, width: r.width, height: r.height }
        }, '*');
      }
    }, true);
  } catch (e) {}
})();`
}

export function htmlHasPreviewInspector(html: string): boolean {
  return typeof html === 'string' && (html.includes(INSPECTOR_FLAG) || html.includes(PREVIEW_INSPECTOR_MARK))
}
