import type { ObjectDetails } from '../core/details';

interface ObjectPanelProps {
  details: ObjectDetails;
  onClose: () => void;
  /** 全屏星图里的浮层样式 */
  floating?: boolean;
}

export function ObjectPanel({ details, onClose, floating = false }: ObjectPanelProps) {
  return (
    <section className={`object-panel${floating ? ' object-panel--floating' : ''}`} aria-live="polite">
      <header>
        <div>
          <h3>{details.title}</h3>
          <span>{details.subtitle}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭详情">
          ×
        </button>
      </header>

      <dl>
        {details.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
