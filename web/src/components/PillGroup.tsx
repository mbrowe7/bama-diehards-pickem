export interface PillItem {
  id: string;
  label: string;
  faint?: boolean;
}

interface PillGroupProps {
  items: PillItem[];
  activeId: string;
  onSelect: (id: string) => void;
  trailing?: { label: string; onClick: () => void };
  /** Above this many items, fall back to a plain <select> so the row doesn't overflow. */
  maxPills?: number;
}

export function PillGroup({ items, activeId, onSelect, trailing, maxPills = 6 }: PillGroupProps) {
  if (items.length > maxPills) {
    return (
      <select className="pill-select" value={activeId} onChange={(e) => onSelect(e.target.value)}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="pill-group">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`pill ${item.id === activeId ? 'pill-active' : ''} ${item.faint ? 'pill-faint' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
      {trailing && (
        <button type="button" className="pill pill-faint" onClick={trailing.onClick}>
          {trailing.label}
        </button>
      )}
    </div>
  );
}
