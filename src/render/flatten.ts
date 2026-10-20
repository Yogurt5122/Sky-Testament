const PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'stop-color',
  'stop-opacity',
  'color',
  'background-color',
  'border-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'visibility',
];

/**
 * 把整棵子树的「计算样式」压成内联样式，返回一个还原函数。
 *
 * SVG 子元素通常靠 CSS 类上色（fill / stroke），栅格化时克隆出去会丢样式；
 * 压成内联后，html-to-image 之类的工具才能忠实还原。
 */
export function inlineComputedStyles(root: HTMLElement): () => void {
  const nodes: Array<HTMLElement | SVGElement> = [
    root,
    ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>('*')),
  ];
  const previous: Array<{ node: HTMLElement | SVGElement; prop: string; value: string }> = [];

  for (const node of nodes) {
    const computed = getComputedStyle(node);
    for (const prop of PROPS) {
      let value = computed.getPropertyValue(prop);
      if (!value) continue;
      // 字体栈里的引号在序列化成 style 属性时容易被破坏，去掉引号（CSS 允许）
      if (prop === 'font-family') value = value.replaceAll('"', '').replaceAll("'", '');
      previous.push({
        node,
        prop,
        value: (node as HTMLElement).style.getPropertyValue(prop),
      });
      (node as HTMLElement).style.setProperty(prop, value);
    }
  }

  return () => {
    for (const { node, prop, value } of previous) {
      if (value) {
        (node as HTMLElement).style.setProperty(prop, value);
      } else {
        (node as HTMLElement).style.removeProperty(prop);
      }
    }
  };
}
