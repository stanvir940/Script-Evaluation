export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'N', action: 'Submit and load next answer' },
    { key: 'P', action: 'Go to previous assignment' },
    { key: 'S', action: 'Save draft' },
    { key: 'Z', action: 'Zoom in on answer image' },
    { key: '+ / −', action: 'Zoom in / out' },
    { key: 'R', action: 'Rotate image 90°' },
    { key: 'F', action: 'Toggle fullscreen' },
    { key: 'Tab', action: 'Move between mark, comment, submit' },
    { key: 'Enter', action: 'Submit when focused on button' },
    { key: 'Esc', action: 'Close modal / exit fullscreen' },
    { key: '?', action: 'Show this help' },
  ];

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="panel p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shortcuts-title" className="text-xl font-semibold text-text-primary mb-4">
          Keyboard Shortcuts
        </h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.key}>
                <td className="font-mono font-semibold">{s.key}</td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
